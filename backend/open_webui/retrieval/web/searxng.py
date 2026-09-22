from __future__ import annotations

import logging
import ssl
from functools import lru_cache

from open_webui.env import AIOHTTP_CLIENT_SESSION_SSL, SEARXNG_CLIENT_CERT_FILE, SEARXNG_CLIENT_KEY_FILE
from open_webui.retrieval.web.main import SearchResult, get_filtered_results
from open_webui.utils.session_pool import get_session

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 中文天气意图检测 + open-meteo 直查（星语定制）
#
# 背景：SearXNG 的 sogou/chinaso 引擎查天气只返回天气网站导航页（content 空
# 串或仅"提供成都天气预报…"的站点描述），实时温度是 JS 渲染的，web loader
# 抓不到 —— 模型只能回答"查不到"。openmeteo 引擎虽返回结构化天气，但其
# geocoding 只认纯英文城市名（"成都"/"成都天气"均 0 结果），中文 query 永远
# 触发不了。故在搜索入口处识别中文天气意图，查内置映射表直调 open-meteo
# API 生成结构化结果，插到结果集最前。
# ---------------------------------------------------------------------------

# 中文城市/地区 -> 英文名（open-meteo geocoding 可识别）
_CN_CITY_MAP: dict[str, str] = {
    '北京': 'beijing', '上海': 'shanghai', '广州': 'guangzhou', '深圳': 'shenzhen',
    '成都': 'chengdu', '重庆': 'chongqing', '杭州': 'hangzhou', '南京': 'nanjing',
    '武汉': 'wuhan', '西安': 'xian', '天津': 'tianjin', '苏州': 'suzhou',
    '长沙': 'changsha', '郑州': 'zhengzhou', '青岛': 'qingdao', '大连': 'dalian',
    '厦门': 'xiamen', '昆明': 'kunming', '拉萨': 'lhasa', '哈尔滨': 'harbin',
    '沈阳': 'shenyang', '长春': 'changchun', '石家庄': 'shijiazhuang', '太原': 'taiyuan',
    '合肥': 'hefei', '福州': 'fuzhou', '南昌': 'nanchang', '济南': 'jinan',
    '南宁': 'nanning', '海口': 'haikou', '贵阳': 'guiyang', '兰州': 'lanzhou',
    '西宁': 'xining', '银川': 'yinchuan', '乌鲁木齐': 'urumqi', '呼和浩特': 'hohhot',
    '香港': 'hong kong', '澳门': 'macau', '台北': 'taipei',
    # 四川地级市/州（星语主服务区）
    '绵阳': 'mianyang', '德阳': 'deyang', '宜宾': 'yibin', '南充': 'nanchong',
    '泸州': 'luzhou', '乐山': 'leshan', '自贡': 'zigong', '攀枝花': 'panzhihua',
    '遂宁': 'suining', '内江': 'neijiang', '广元': 'guangyuan', '眉山': 'meishan',
    '广安': 'guangan', '达州': 'dazhou', '雅安': 'yaan', '巴中': 'bazhong',
    '资阳': 'ziyang', '阿坝': 'aba', '甘孜': 'garze', '凉山': 'liangshan',
    # 省名兜底（映射到省会）
    '四川': 'chengdu', '贵州': 'guiyang', '云南': 'kunming',
}

# 天气意图关键词
_WEATHER_HINTS = ('天气', '气温', '温度多少', '下雨', '下雪', '冷不冷', '热不热', '几度', 'weather')

# WMO 天气码 -> 中文
_WMO_CN: dict[int, str] = {
    0: '晴', 1: '晴间少云', 2: '多云', 3: '阴', 45: '雾', 48: '雾凇',
    51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨', 56: '冻毛毛雨', 57: '强冻毛毛雨',
    61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '强冻雨',
    71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
    80: '小阵雨', 81: '阵雨', 82: '强阵雨', 85: '小阵雪', 86: '阵雪',
    95: '雷阵雨', 96: '雷阵雨伴小冰雹', 99: '雷阵雨伴大冰雹',
}


def _detect_weather_intent(query: str) -> tuple[str, str] | None:
    """检测中文天气查询意图。命中返回 (中文名, 英文名)，否则 None。"""
    if not query or not any(h in query for h in _WEATHER_HINTS):
        return None
    # 城市名可能带后缀（成都市/成都地区），用前缀匹配最稳妥
    for cn, en in _CN_CITY_MAP.items():
        if cn in query:
            return cn, en
    return None


async def _fetch_open_meteo_weather(city_en: str, city_cn: str) -> SearchResult | None:
    """直调 open-meteo API 取结构化天气，失败返回 None（不影响主流程）。"""
    import asyncio

    session = await get_session()
    try:
        async with session.get(
            f'https://geocoding-api.open-meteo.com/v1/search?name={city_en}&count=1&language=zh',
            ssl=False,
            timeout=5,
        ) as resp:
            geo = await resp.json()
        locs = geo.get('results') or []
        if not locs:
            return None
        loc = locs[0]
        lat, lon = loc['latitude'], loc['longitude']

        async with session.get(
            f'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}'
            f'&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m'
            f'&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=auto',
            ssl=False,
            timeout=5,
        ) as resp:
            data = await resp.json()
    except Exception as e:
        log.warning('open-meteo weather fetch failed for %s: %s', city_en, e)
        return None

    cur = data.get('current') or {}
    daily = data.get('daily') or {}
    temp = cur.get('temperature_2m')
    if temp is None:
        return None
    feels = cur.get('apparent_temperature')
    humidity = cur.get('relative_humidity_2m')
    wind = cur.get('wind_speed_10m')
    code = cur.get('weather_code')
    cond = _WMO_CN.get(code, '未知')
    time_str = (cur.get('time') or '').replace('T', ' ')

    lines = [
        f'{city_cn}实时天气（数据源 open-meteo，观测时间 {time_str}）：',
        f'当前气温 {temp}°C（体感 {feels}°C），{cond}，湿度 {humidity}%，风速 {wind} km/h。',
    ]
    dates = daily.get('time') or []
    his = daily.get('temperature_2m_max') or []
    los = daily.get('temperature_2m_min') or []
    codes = daily.get('weather_code') or []
    if dates:
        fc = []
        for i, d in enumerate(dates[:3]):
            dcond = _WMO_CN.get(codes[i] if i < len(codes) else -1, '')
            hi = his[i] if i < len(his) else '?'
            lo = los[i] if i < len(los) else '?'
            fc.append(f'{d} {dcond} {lo}~{hi}°C')
        lines.append('未来三天：' + '；'.join(fc))

    doc = ' '.join(lines)
    return SearchResult(
        link=f'https://open-meteo.com/{city_en}',
        title=f'{city_cn}实时天气（结构化数据）',
        snippet=doc,
    )

# SearXNG request headers — identifies the bot to instance operators.
_SEARXNG_HEADERS = {
    # LICENSE covers this Open WebUI user-agent identifier.
    # Do not alter, remove, obscure, or replace it except as LICENSE permits:
    # https://docs.openwebui.com/license.
    'User-Agent': 'Open WebUI (https://github.com/open-webui/open-webui) RAG Bot',
    'Accept': 'text/html',
    'Accept-Encoding': 'gzip, deflate',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
}


@lru_cache
def _get_ssl_context() -> bool | ssl.SSLContext:
    if not SEARXNG_CLIENT_CERT_FILE:
        return AIOHTTP_CLIENT_SESSION_SSL

    ssl_context = ssl.create_default_context()
    ssl_context.load_cert_chain(
        certfile=SEARXNG_CLIENT_CERT_FILE,
        keyfile=SEARXNG_CLIENT_KEY_FILE or None,
    )
    return ssl_context


async def search_searxng(
    query_url: str,
    query: str,
    count: int,
    filter_list: list[str] | None = None,
    **kwargs,
) -> list[SearchResult]:
    """Query a SearXNG instance and return results sorted by relevance score.

    Optional keyword arguments (language, safesearch, time_range, categories)
    are forwarded directly as SearXNG query parameters.
    """
    # Normalise legacy ``<query>``-style URLs by stripping any query string.
    if '<query>' in query_url:
        query_url = query_url.split('?')[0]

    params = {
        'q': query,
        'format': 'json',
        'pageno': 1,
        'safesearch': kwargs.get('safesearch', '1'),
        'language': kwargs.get('language', 'all').strip().rstrip(','),
        'time_range': kwargs.get('time_range', ''),
        'categories': ''.join(kwargs.get('categories', [])),
        'theme': 'simple',
        'image_proxy': 0,
    }

    log.debug('searching %s', query_url)

    session = await get_session()
    async with session.get(
        query_url,
        headers=_SEARXNG_HEADERS,
        params=params,
        ssl=_get_ssl_context(),
    ) as response:
        response.raise_for_status()
        payload = await response.json()

    results = sorted(payload.get('results', []), key=lambda x: x.get('score', 0), reverse=True)
    if filter_list:
        results = get_filtered_results(results, filter_list)

    search_results = [
        SearchResult(
            link=item.get('url', ''),
            title=item.get('title'),
            snippet=item.get('content'),
        )
        for item in results[:count]
    ]

    # ---------------------------------------------------------------
    # 星语定制：中文天气意图检测 → open-meteo 直查，结构化结果置顶
    # ---------------------------------------------------------------
    city = _detect_weather_intent(query)
    if city:
        weather_result = await _fetch_open_meteo_weather(city[1], city[0])
        if weather_result:
            search_results.insert(0, weather_result)

    # SearXNG `answers` 字段承载即时答案（openmeteo 引擎对英文 query 生效）。
    # 原版只读 `results`，天气查询只剩天气网站导航页链接（content 为空串），
    # 实时数字是 JS 渲染的，web loader 抓不到 —— 模型只能回答"查不到"。
    # 这里把 answers 序列化为伪文档注入结果集，模型可直接读到温度等数据。
    # 仅处理天气类 answer（template=answer/weather.html）；其他类型保持原样。
    for answer in payload.get('answers') or []:
        if not isinstance(answer, dict):
            continue
        template = answer.get('template') or ''
        current = answer.get('current') or {}
        if template == 'answer/weather.html' and current:
            location = current.get('location') or {}
            loc_name = location.get('name') or answer.get('engine') or 'weather'
            parts = []
            for label, keys in (
                ('温度', ('temperature',)),
                ('体感', ('feels_like',)),
                ('天气', ('condition',)),
                ('湿度', ('humidity',)),
                ('风速', ('wind_speed',)),
                ('气压', ('pressure',)),
                ('云量', ('cloud_cover',)),
            ):
                for key in keys:
                    val = current.get(key)
                    if isinstance(val, dict):
                        v = val.get('val')
                        u = val.get('unit', '')
                        if v is not None:
                            parts.append(f'{label}: {v}{u}')
                    elif isinstance(val, (int, float)):
                        parts.append(f'{label}: {val}')
                    elif isinstance(val, str) and val:
                        parts.append(f'{label}: {val}')
            summary = current.get('summary') or ', '.join(parts)
            forecast = answer.get('forecast') or []
            forecast_lines = []
            for day in forecast[:3]:
                if isinstance(day, dict):
                    dt = day.get('date') or day.get('datetime') or ''
                    hi = (day.get('temperature') or {}).get('max') or (day.get('temperature') or {}).get('val')
                    lo = (day.get('temperature') or {}).get('min')
                    cond = day.get('condition') or ''
                    line = f"{dt} {cond}"
                    if hi is not None:
                        line += f" 最高 {hi}°C"
                    if lo is not None:
                        line += f" 最低 {lo}°C"
                    forecast_lines.append(line)
            doc = f'{loc_name} 当前天气（来源 open-meteo 实时数据）: {summary}'
            if parts:
                doc += ' | ' + ', '.join(parts)
            if forecast_lines:
                doc += '。未来预报: ' + '；'.join(forecast_lines)
            search_results.insert(0, SearchResult(link=f'https://open-meteo.com/{loc_name}', title=f'{loc_name} 实时天气（结构化数据）', snippet=doc))
            break  # 天气 answer 只取第一条

    return search_results
