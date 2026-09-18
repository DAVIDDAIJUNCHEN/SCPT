<script lang="ts">
	import { getContext } from 'svelte';
	const i18n = getContext('i18n');

	import { models } from '$lib/stores';
	import Tooltip from '$lib/components/common/Tooltip.svelte';

	export let selectedModels: string[] = [''];
	export let disabled = false;
	/** 双向绑定父组件（MessageInput）的联网检索开关 */
	export let webSearchEnabled = false;

	// 川邮·星语 S3.2：模式 pill（按网关实测能力定义，见 docs/stage2-chat/README.md）
	//
	// 设计原则（大王要求「别搞太复杂，但要体现我们的模型能力」）：
	//   1. 只暴露**实测可用**的模型；候选缺失自动降级，绝不谎报能力
	//   2. 每个模式 = 一组模型偏好；偏好顺序靠前者优先
	//   3. glm-5.3 属重量级算力，**不面向普通用户**（网关白名单已收紧）
	//
	// 「智能搜索」模式不是换模型，而是打开 OWUI 联网检索（SearXNG）开关。
	type Mode = {
		id: string;
		label: string;
		icon: string;
		/** 'model' = 切换模型；'search' = 切换联网检索开关 */
		kind: 'model' | 'search';
		candidates?: string[];
		matcher?: (id: string) => boolean;
	};

	const MODES: Mode[] = [
		{
			id: 'search',
			label: 'Smart Search',
			icon: '⌕',
			kind: 'search'
		},
		{
			id: 'instant',
			label: 'Fast',
			icon: '⚡',
			kind: 'model',
			// 极速：低延迟小模型。实测均为非强制思考或快速档
			candidates: ['glm-5.3-flash', 'deepseek-v4-flash-0731', 'DeepSeek-V4-Flash-0731'],
			matcher: (id) => /flash/i.test(id) && !/v4\.1/i.test(id)
		},
		{
			id: 'think',
			label: 'Deep Think',
			icon: '◎',
			kind: 'model',
			// 深度思考：实测 reasoning_content 非空的 always-thinking 模型
			candidates: ['DeepSeek-V4.1-Flash', 'qwen3.8-flash-next'],
			matcher: (id) => /v4\.1-flash|thinking/i.test(id)
		},
		{
			id: 'vision',
			label: 'Vision',
			icon: '◉',
			kind: 'model',
			// 视觉：实测支持图像输入的多模态模型
			candidates: ['Qwen3-VL-30B-A3B-Instruct', 'qwen3-vl-30b'],
			matcher: (id) => /vl-|vision/i.test(id)
		}
	];

	const availableModelIds = () => ($models ?? []).map((m: any) => m.id);

	// 解析某模式实际可用的模型 id（按候选顺序，找不到就用 matcher 兜底扫一遍）
	const resolveModelId = (mode: Mode): string | undefined => {
		if (mode.kind === 'search') return undefined;
		const ids = availableModelIds();
		for (const c of mode.candidates ?? []) {
			const hit = ids.find((id: string) => id === c);
			if (hit) return hit;
		}
		return mode.matcher ? ids.find((id: string) => mode.matcher!(id)) : undefined;
	};

	// 搜索模式无模型依赖，只要后端开了 web search 就可点
	$: searchAvailable = true;

	const isModeAvailable = (mode: Mode) =>
		mode.kind === 'search' ? searchAvailable : !!resolveModelId(mode);

	$: currentModelId = selectedModels?.[0] ?? '';
	$: activeModeId = webSearchEnabled
		? 'search'
		: (MODES.find((m) => m.kind === 'model' && m.matcher && m.matcher(currentModelId))?.id ?? '');

	const selectMode = (mode: Mode) => {
		if (disabled) return;
		if (mode.kind === 'search') {
			webSearchEnabled = !webSearchEnabled;
			return;
		}
		const target = resolveModelId(mode);
		if (!target) return;
		// 切模型时关掉搜索态，避免模式语义混淆
		webSearchEnabled = false;
		selectedModels = [target];
	};

	const tooltipFor = (mode: Mode) => {
		if (!isModeAvailable(mode)) {
			return `${$i18n.t(mode.label)} · ${$i18n.t('Model not available')}`;
		}
		if (mode.kind === 'search') {
			return `${$i18n.t(mode.label)} · ${$i18n.t('Search the web for answers')}`;
		}
		return `${$i18n.t(mode.label)} · ${resolveModelId(mode)}`;
	};
</script>

<div class="flex items-center gap-1 shrink-0">
	{#each MODES as mode (mode.id)}
		{@const available = isModeAvailable(mode)}
		<Tooltip content={tooltipFor(mode)} placement="top">
			<button
				type="button"
				id="mode-pill-{mode.id}"
				class="flex items-center gap-1 rounded-full px-2.5 py-[0.1875rem] text-[0.75rem] leading-4 transition-colors duration-150 whitespace-nowrap
				{activeModeId === mode.id
					? 'bg-[#4562f0] text-white shadow-[0_0_10px_rgba(69,98,240,0.35)]'
					: 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'}
				{!available || disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}"
				aria-pressed={activeModeId === mode.id}
				disabled={disabled || !available}
				on:click={(e) => {
					e.stopPropagation();
					selectMode(mode);
				}}
			>
				<span class="text-[0.6875rem] leading-none" aria-hidden>{mode.icon}</span>
				<span class="translate-y-[0.5px]">{$i18n.t(mode.label)}</span>
			</button>
		</Tooltip>
	{/each}
</div>