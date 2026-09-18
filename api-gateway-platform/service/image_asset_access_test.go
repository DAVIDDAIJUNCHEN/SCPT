package service

import (
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
)

func TestCanonicalImageAssetChannelID(t *testing.T) {
	valid := []struct {
		in   string
		want string
	}{
		{"7", "7"},
		{"07", "7"},
		{" 7 ", "7"},
		{"+7", "7"},
		{"123", "123"},
	}
	for _, tc := range valid {
		got, ok := CanonicalImageAssetChannelID(tc.in)
		if !ok || got != tc.want {
			t.Errorf("CanonicalImageAssetChannelID(%q) = (%q, %v), want (%q, true)", tc.in, got, ok, tc.want)
		}
	}

	invalid := []string{"", "0", "-1", "abc", "1.5", "999999999999999999999999"}
	for _, in := range invalid {
		if got, ok := CanonicalImageAssetChannelID(in); ok {
			t.Errorf("CanonicalImageAssetChannelID(%q) = (%q, true), want ok=false", in, got)
		}
	}
}

func TestImageAssetAccessRoundTrip(t *testing.T) {
	originalSecret := common.CryptoSecret
	common.CryptoSecret = "test-crypto-secret-for-image-asset"
	defer func() { common.CryptoSecret = originalSecret }()

	access, err := IssueImageAssetAccess("7", "asset-abc")
	if err != nil {
		t.Fatalf("IssueImageAssetAccess failed: %v", err)
	}
	if access == "" {
		t.Fatal("IssueImageAssetAccess returned empty token")
	}

	// Correct binding verifies, including non-canonical channel id forms.
	for _, channelID := range []string{"7", "07", " 7 "} {
		if !VerifyImageAssetAccess(access, channelID, "asset-abc") {
			t.Errorf("VerifyImageAssetAccess with channelID=%q should succeed", channelID)
		}
	}

	// A different channel or asset must not verify: the signature binds both.
	if VerifyImageAssetAccess(access, "8", "asset-abc") {
		t.Error("VerifyImageAssetAccess must reject a different channel id")
	}
	if VerifyImageAssetAccess(access, "7", "asset-xyz") {
		t.Error("VerifyImageAssetAccess must reject a different asset id")
	}
	if VerifyImageAssetAccess("", "7", "asset-abc") {
		t.Error("VerifyImageAssetAccess must reject an empty token")
	}
	if VerifyImageAssetAccess(access+"x", "7", "asset-abc") {
		t.Error("VerifyImageAssetAccess must reject a tampered token")
	}
}

func TestIsRelativeImageAssetURL(t *testing.T) {
	// Paths that need rewriting.
	relative := []string{
		"/v1/images/abc/content",
		"/files/xyz.png",
	}
	for _, raw := range relative {
		if !IsRelativeImageAssetURL(raw) {
			t.Errorf("IsRelativeImageAssetURL(%q) = false, want true", raw)
		}
	}

	// Must be left untouched: already usable, or not a URL at all.
	absolute := []string{
		"",
		"https://cdn.example.com/a.png",
		"http://10.32.1.3:30606/v1/images/a/content",
		"data:image/png;base64,iVBORw0KGgo=",
		"//cdn.example.com/a.png",
		"iVBORw0KGgoAAAANSUhEUg", // bare base64 payload
	}
	for _, raw := range absolute {
		if IsRelativeImageAssetURL(raw) {
			t.Errorf("IsRelativeImageAssetURL(%q) = true, want false", raw)
		}
	}
}

func TestIssueImageAssetAccessRejectsBadInput(t *testing.T) {
	originalSecret := common.CryptoSecret
	common.CryptoSecret = "test-crypto-secret"
	defer func() { common.CryptoSecret = originalSecret }()

	if _, err := IssueImageAssetAccess("0", "asset"); err == nil {
		t.Error("expected error for channel id 0")
	}
	if _, err := IssueImageAssetAccess("7", ""); err == nil {
		t.Error("expected error for empty asset id")
	}
	if _, err := IssueImageAssetAccess("7", string(make([]byte, maxImageAssetIDLength+1))); err == nil {
		t.Error("expected error for over-long asset id")
	}

	// Without a secret no capability can be minted: fail closed.
	common.CryptoSecret = ""
	if _, err := IssueImageAssetAccess("7", "asset"); err == nil {
		t.Error("expected error when CryptoSecret is empty")
	}
	if VerifyImageAssetAccess("anything", "7", "asset") {
		t.Error("VerifyImageAssetAccess must fail closed without CryptoSecret")
	}
}

func TestImageAssetTokensAreBoundToChannel(t *testing.T) {
	originalSecret := common.CryptoSecret
	common.CryptoSecret = "test-crypto-secret"
	defer func() { common.CryptoSecret = originalSecret }()

	// Same asset id on two channels must produce different tokens, otherwise a
	// token from one channel could be replayed against another.
	first, err := IssueImageAssetAccess("7", "same-asset")
	if err != nil {
		t.Fatalf("issue for channel 7: %v", err)
	}
	second, err := IssueImageAssetAccess("8", "same-asset")
	if err != nil {
		t.Fatalf("issue for channel 8: %v", err)
	}
	if first == second {
		t.Errorf("tokens for different channels are identical (%s); channel binding is broken", first)
	}

	// Sanity: token length matches what verification expects.
	if len(first) != imageAssetAccessLength {
		t.Errorf("token length = %d, want %d", len(first), imageAssetAccessLength)
	}
	if _, err := strconv.Atoi(first); err == nil {
		t.Error("token should not be a plain number")
	}
}