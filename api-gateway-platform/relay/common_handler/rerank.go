package common_handler

import (
	"io"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/relay/channel/xinference"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func RerankHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}
	service.CloseResponseBodyGracefully(resp)
	logger.LogDebug(c, "reranker response body: %s", responseBody)
	var jinaResp dto.RerankResponse
	if info.ChannelType == constant.ChannelTypeXinference {
		var xinRerankResponse xinference.XinRerankResponse
		err = common.Unmarshal(responseBody, &xinRerankResponse)
		if err != nil {
			return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
		}
		jinaRespResults := make([]dto.RerankResponseResult, len(xinRerankResponse.Results))
		for i, result := range xinRerankResponse.Results {
			respResult := dto.RerankResponseResult{
				Index:          result.Index,
				RelevanceScore: result.RelevanceScore,
			}
			if info.ReturnDocuments {
				var document any
				if result.Document != nil {
					if doc, ok := result.Document.(string); ok {
						if doc == "" {
							document = info.Documents[result.Index]
						} else {
							document = doc
						}
					} else {
						document = result.Document
					}
				}
				respResult.Document = document
			}
			jinaRespResults[i] = respResult
		}
		jinaResp = dto.RerankResponse{
			Results: jinaRespResults,
			Usage: dto.Usage{
				PromptTokens: info.GetEstimatePromptTokens(),
				TotalTokens:  info.GetEstimatePromptTokens(),
			},
		}
	} else {
		err = common.Unmarshal(responseBody, &jinaResp)
		if err != nil {
			// SGLang /v1/rerank returns a bare JSON array of results
			// (no "results"/"usage" wrapper). Retry as a raw array before failing.
			type sglangRerankResult struct {
				Index    int   `json:"index"`
				Score    any   `json:"score"`
				Document any   `json:"document"`
			}
			var arrayResp []sglangRerankResult
			if arrayErr := common.Unmarshal(responseBody, &arrayResp); arrayErr == nil && len(arrayResp) > 0 {
				results := make([]dto.RerankResponseResult, len(arrayResp))
				for i, r := range arrayResp {
					score := 0.0
					switch s := r.Score.(type) {
					case float64:
						score = s
					case string:
						if f, parseErr := strconv.ParseFloat(s, 64); parseErr == nil {
							score = f
						}
					}
					respResult := dto.RerankResponseResult{
						Index:          r.Index,
						RelevanceScore: score,
					}
					if info.ReturnDocuments {
						var document any
						if r.Document == nil {
							if r.Index >= 0 && r.Index < len(info.Documents) {
								document = info.Documents[r.Index]
							}
						} else {
							document = r.Document
						}
						respResult.Document = document
					}
					results[i] = respResult
				}
				jinaResp = dto.RerankResponse{
					Results: results,
					Usage: dto.Usage{
						PromptTokens: info.GetEstimatePromptTokens(),
						TotalTokens:  info.GetEstimatePromptTokens(),
					},
				}
			} else {
				return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
			}
		}
		jinaResp.Usage.PromptTokens = jinaResp.Usage.TotalTokens
	}

	c.Writer.Header().Set("Content-Type", "application/json")
	c.JSON(http.StatusOK, jinaResp)
	return &jinaResp.Usage, nil
}
