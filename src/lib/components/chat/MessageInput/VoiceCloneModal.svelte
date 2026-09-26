<script lang="ts">
	import { getContext, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import { toast } from 'svelte-sonner';

	import {
		getUserVoices,
		createVoiceClone,
		deleteUserVoice,
		transcribeAudio,
		type UserVoice
	} from '$lib/apis/audio';

	import Modal from '$lib/components/common/Modal.svelte';

	const i18n = getContext('i18n');

	export let show = false;

	let mediaRecorder: MediaRecorder | null = null;
	let audioChunks: Blob[] = [];
	let audioBlob: Blob | null = null;
	let audioUrl: string | null = null;

	let recording = false;
	let processing = false;
	let transcribing = false;
	let elapsed = 0;
	let timerInterval: ReturnType<typeof setInterval> | null = null;

	let voiceName = '';
	let refText = '';
	let voices: UserVoice[] = [];
	let loadingVoices = false;

	const MIN_SECONDS = 3;
	const MAX_SECONDS = 30;

	const loadVoices = async () => {
		loadingVoices = true;
		try {
			voices = await getUserVoices(localStorage.token);
		} catch (e) {
			console.error(e);
		} finally {
			loadingVoices = false;
		}
	};

	$: if (show && !loadingVoices && voices.length === 0) {
		loadVoices();
	}

	const resetRecording = () => {
		if (audioUrl) {
			URL.revokeObjectURL(audioUrl);
		}
		audioBlob = null;
		audioUrl = null;
		audioChunks = [];
		elapsed = 0;
	};

	// 录音结束后：自动转写回填参考文本（用户可再编辑）
	const autoTranscribe = async () => {
		if (!audioBlob) return;
		transcribing = true;
		try {
			const file = new File([audioBlob], 'recording.webm', { type: audioBlob.type });
			const res = await transcribeAudio(localStorage.token, file);
			const text = res?.text?.trim();
			if (text) {
				refText = text;
			}
		} catch (e) {
			// 转写失败不阻断流程：留空则由 cosyvoice 侧自动转写
			console.error('auto transcribe failed:', e);
		} finally {
			transcribing = false;
		}
	};

	const startRecording = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRecorder = new MediaRecorder(stream, {
				mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
					? 'audio/webm;codecs=opus'
					: 'audio/webm'
			});
			audioChunks = [];

			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) audioChunks.push(e.data);
			};

			mediaRecorder.onstop = () => {
				audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
				audioUrl = URL.createObjectURL(audioBlob);
				stream.getTracks().forEach((t) => t.stop());
				// 自动转写
				autoTranscribe();
			};

			mediaRecorder.start();
			recording = true;
			elapsed = 0;
			timerInterval = setInterval(() => {
				elapsed += 1;
				if (elapsed >= MAX_SECONDS) {
					stopRecording();
				}
			}, 1000);
		} catch (e) {
			console.error(e);
			toast.error($i18n.t('Unable to access the microphone. Please check browser permissions.'));
		}
	};

	const stopRecording = () => {
		recording = false;
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			mediaRecorder.stop();
		}
	};

	const submitClone = async () => {
		if (!audioBlob) {
			toast.error($i18n.t('Please record audio first (3-30 seconds).'));
			return;
		}
		if (elapsed < MIN_SECONDS) {
			toast.error($i18n.t('Recording too short. Please record at least 3 seconds.'));
			return;
		}
		if (!voiceName.trim()) {
			toast.error($i18n.t('Please enter a voice name.'));
			return;
		}

		processing = true;
		try {
			await createVoiceClone(localStorage.token, audioBlob, voiceName.trim(), refText.trim());
			toast.success($i18n.t('Voice created! You can now select it in TTS settings.'));
			resetRecording();
			voiceName = '';
			refText = '';
			await loadVoices();
		} catch (e) {
			toast.error(`${e}`);
		} finally {
			processing = false;
		}
	};

	const removeVoice = async (voice: UserVoice) => {
		const confirmed = window.confirm(
			$i18n.t('Delete voice "{{NAME}}"? This cannot be undone.', { values: { NAME: voice.name } })
		);
		if (!confirmed) return;

		try {
			await deleteUserVoice(localStorage.token, voice.id);
			toast.success($i18n.t('Voice deleted.'));
			await loadVoices();
		} catch (e) {
			toast.error(`${e}`);
		}
	};

	onDestroy(() => {
		if (timerInterval) clearInterval(timerInterval);
		if (audioUrl) URL.revokeObjectURL(audioUrl);
	});
</script>

<Modal bind:show className="bg-white dark:bg-gray-900 rounded-3xl">
	<div class="mx-auto max-h-[85vh] max-w-lg overflow-y-auto scrollbar-thin px-6 py-5" transition:fade={{ duration: 150 }}>
		<div class="mb-4 flex items-center justify-between">
			<div class="text-lg font-medium">{$i18n.t('Clone My Voice')}</div>
			<button
				class="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
				type="button"
				on:click={() => {
					show = false;
				}}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" />
				</svg>
			</button>
		</div>

		<div class="mb-4 text-sm text-gray-500 dark:text-gray-400">
			{$i18n.t(
				'Record 3-30 seconds of your voice. The cloned voice is private and only usable by you.'
			)}
		</div>

		<!-- 录音区：未录 = 大按钮；录制中 = 停止按钮；已录 = 播放器 + 重录 -->
		<div class="mb-4 flex flex-col items-center rounded-xl bg-gray-50 dark:bg-gray-900/50 p-6">
			{#if !recording && !audioBlob}
				<button
					class="flex size-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:scale-105"
					type="button"
					on:click={startRecording}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M12 19v-7" stroke-linecap="round" />
						<path d="M9 12h6l-3 7z" fill="currentColor" stroke="none" />
						<rect x="9" y="3" width="6" height="12" rx="3" />
						<path d="M5 11a7 7 0 0 0 14 0" stroke-linecap="round" />
					</svg>
				</button>
				<div class="mt-3 text-sm text-gray-500 dark:text-gray-400">
					{$i18n.t('Tap to start recording')}
				</div>
			{:else if recording}
				<button
					class="flex size-16 items-center justify-center rounded-full bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 shadow-lg animate-pulse"
					type="button"
					on:click={stopRecording}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="size-6" viewBox="0 0 24 24" fill="currentColor">
						<rect x="6" y="6" width="12" height="12" rx="2" />
					</svg>
				</button>
				<div class="mt-3 flex items-center gap-2 text-sm font-medium text-red-500">
					<span class="inline-block size-2 rounded-full bg-red-500 animate-pulse"></span>
					{elapsed} / {MAX_SECONDS}s
				</div>
			{:else}
				<div class="flex w-full flex-col items-center gap-3">
					{#if audioUrl}
						<audio src={audioUrl} controls class="w-full"></audio>
					{/if}
					<div class="flex items-center gap-4">
						<button
							class="text-sm text-gray-500 underline hover:text-gray-800 dark:hover:text-gray-200"
							type="button"
							on:click={resetRecording}
						>{$i18n.t('Re-record')}</button>
					</div>
				</div>
			{/if}
		</div>

		<!-- 名称 + 参考文本（转写结果自动回填，可编辑） -->
		<div class="mb-4 space-y-3">
			<div>
				<div class="mb-1.5 text-sm font-medium">{$i18n.t('Voice Name')}</div>
				<input
					class="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-850 px-3 py-2 text-sm text-gray-900 dark:text-gray-50 outline-none focus:ring-1 focus:ring-blue-400"
					type="text"
					bind:value={voiceName}
					maxlength="30"
					placeholder={$i18n.t('e.g. My Voice')}
				/>
			</div>
			<div>
				<div class="mb-1.5 flex items-center gap-2 text-sm font-medium">
					{$i18n.t('Reference Text')}
					{#if transcribing}
						<span class="inline-flex items-center gap-1 font-normal text-gray-400">
							<svg class="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
							</svg>
							{$i18n.t('Transcribing...')}
						</span>
					{:else}
						<span class="font-normal text-gray-400">{$i18n.t('(editable)')}</span>
					{/if}
				</div>
				<textarea
					class="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-850 px-3 py-2 text-sm text-gray-900 dark:text-gray-50 outline-none focus:ring-1 focus:ring-blue-400 resize-none"
					rows="2"
					bind:value={refText}
					placeholder={$i18n.t('What you said in the recording')}
				></textarea>
			</div>
		</div>

		<div class="mb-6 flex justify-end">
			<button
				class="px-4 py-2 text-sm font-medium rounded-lg text-white transition disabled:opacity-50"
				class:bg-blue-600={!processing}
				class:hover:bg-blue-700={!processing}
				type="button"
				disabled={processing || !audioBlob || !voiceName.trim()}
				on:click={submitClone}
			>
				{#if processing}
					{$i18n.t('Cloning...')}
				{:else}
					{$i18n.t('Create Voice')}
				{/if}
			</button>
		</div>

		<!-- 我的音色列表 -->
		<div>
			<div class="mb-2 text-sm font-medium">{$i18n.t('My Voices')}</div>
			{#if loadingVoices}
				<div class="py-4 text-center text-sm text-gray-400">...</div>
			{:else if voices.length === 0}
				<div class="py-3 text-sm text-gray-400">{$i18n.t('No custom voices yet.')}</div>
			{:else}
				<div class="space-y-1">
					{#each voices as voice (voice.id)}
						<div class="flex items-center justify-between rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2">
							<div class="min-w-0 flex-1">
								<div class="text-sm font-medium truncate">{voice.name}</div>
								<div class="text-xs text-gray-400 truncate">
									{new Date(voice.created_at * 1000).toLocaleDateString()}
								</div>
							</div>
							<button
								class="ml-2 shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
								type="button"
								on:click={() => removeVoice(voice)}
								title={$i18n.t('Delete')}
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" stroke-linecap="round" stroke-linejoin="round" />
									<path d="M10 11v6M14 11v6" stroke-linecap="round" />
								</svg>
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</Modal>
