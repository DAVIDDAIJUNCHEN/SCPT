<script lang="ts">
	import { getContext } from 'svelte';
	const i18n = getContext('i18n');

	import { models } from '$lib/stores';
	import Tooltip from '$lib/components/common/Tooltip.svelte';

	export let selectedModels: string[] = [''];
	export let disabled = false;

	// 川邮·星语 S3.2：4 模式 pill（对齐 DeepSeek）
	// 每个模式是一组「模型偏好」，点击即把当前会话模型切到该组中第一个可用模型。
	// 偏好顺序 = 列表内靠前者优先，缺失则自动降级到下一个候选。
	type Mode = {
		id: string;
		label: string;
		icon: string;
		candidates: string[];
		matcher: (id: string) => boolean;
	};

	const MODES: Mode[] = [
		{
			id: 'instant',
			label: 'Instant',
			icon: '⚡',
			// 极速：低延迟小模型
			candidates: ['glm-5.3-flash', 'qwen3.8-flash-next', 'deepseek-v4-flash-0731', 'DeepSeek-V4-Flash-0731'],
			matcher: (id) => /flash/i.test(id) && !/v4\.1/i.test(id)
		},
		{
			id: 'expert',
			label: 'Expert',
			icon: '◆',
			// 专家：综合能力最强
			candidates: ['glm-5.3', 'deepseek-v4-pro', 'qwen3.8-flash-next'],
			matcher: (id) => /^(glm-5\.3|deepseek-v4-pro)$/i.test(id)
		},
		{
			id: 'think',
			label: 'Deep Think',
			icon: '◎',
			// 深度思考：always-thinking 模型，思考链会折叠展示
			candidates: ['DeepSeek-V4.1-Flash', 'glm-5.3', 'qwen3.8-flash-next'],
			matcher: (id) => /v4\.1-flash|thinking/i.test(id)
		},
		{
			id: 'vision',
			label: 'Vision',
			icon: '◉',
			// 视觉：多模态看图
			candidates: ['Qwen3-VL-30B-A3B-Instruct', 'qwen3-vl-30b'],
			matcher: (id) => /vl-|vision/i.test(id)
		}
	];

	const availableModelIds = () => ($models ?? []).map((m: any) => m.id);

	// 解析某模式实际可用的模型 id（按候选顺序，找不到就用 matcher 兜底扫一遍）
	const resolveModelId = (mode: Mode): string | undefined => {
		const ids = availableModelIds();
		for (const c of mode.candidates) {
			const hit = ids.find((id: string) => id === c);
			if (hit) return hit;
		}
		return ids.find((id: string) => mode.matcher(id));
	};

	$: currentModelId = selectedModels?.[0] ?? '';
	$: activeModeId = MODES.find((m) => m.matcher(currentModelId))?.id ?? '';

	const selectMode = (mode: Mode) => {
		if (disabled) return;
		const target = resolveModelId(mode);
		if (!target) return;
		selectedModels = [target];
	};
</script>

<div class="flex items-center gap-1 shrink-0">
	{#each MODES as mode (mode.id)}
		{@const available = !!resolveModelId(mode)}
		<Tooltip
			content={available
				? `${$i18n.t(mode.label)} · ${resolveModelId(mode)}`
				: `${$i18n.t(mode.label)} · ${$i18n.t('Model not available')}`}
			placement="top"
		>
			<button
				type="button"
				id="mode-pill-{mode.id}"
				class="flex items-center gap-1 rounded-full px-2.5 py-[0.1875rem] text-[0.75rem] leading-4 transition-colors duration-150 whitespace-nowrap
				{activeModeId === mode.id
					? 'bg-[#4562f0] text-white shadow-[0_0_10px_rgba(69,98,240,0.35)]'
					: 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'}
				{!available || disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}"
				aria-pressed={activeModeId === mode.id}
				{disabled}
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
