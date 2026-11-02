<script lang="ts">
	import ChatMessage from '#lib/ChatMessage.svelte';

	type Message = { role: 'user' | 'assistant'; content: string };

	let messages = $state<Message[]>([]);
	let input = $state('');
	let errorText = $state('');
	let controller = $state<AbortController | null>(null);
	let log: HTMLElement;

	let streaming = $derived(controller !== null);
	let canSend = $derived(input.trim() !== '' && !streaming);

	// Reruns whenever the messages change, including each streamed chunk.
	$effect(() => {
		messages.at(-1)?.content;
		log.scrollTop = log.scrollHeight;
	});

	async function send(event?: SubmitEvent) {
		event?.preventDefault();
		if (!canSend) return;

		const text = input.trim();
		input = '';
		errorText = '';
		messages.push({ role: 'user', content: text });
		const history = $state.snapshot(messages);
		messages.push({ role: 'assistant', content: '' });
		const reply = messages[messages.length - 1];

		controller = new AbortController();
		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ messages: history }),
				signal: controller.signal
			});
			if (!res.ok || !res.body) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.message ?? 'Something went wrong.');
			}

			const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				reply.content += value;
			}
		} catch (err) {
			if (!controller?.signal.aborted) {
				errorText = err instanceof Error ? err.message : 'Something went wrong.';
			}
		} finally {
			// Nothing arrived: drop the turn and give the text back so it can be retried.
			if (!reply.content.trim()) {
				messages.splice(-2, 2);
				input = text;
			}
			controller = null;
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			send();
		}
	}

	function newChat() {
		controller?.abort();
		messages = [];
		errorText = '';
	}
</script>

<svelte:head>
	<title>Svelte Chat</title>
</svelte:head>

<main>
	<header>
		<h1>Svelte Chat</h1>
		<button type="button" class="secondary" onclick={newChat} disabled={messages.length === 0}>New chat</button>
	</header>

	<section class="log" role="log" bind:this={log}>
		{#each messages as message}
			<ChatMessage role={message.role} content={message.content} />
		{:else}
			<p class="empty">Ask anything to get started.</p>
		{/each}
	</section>

	{#if errorText}
		<p class="error" role="alert">{errorText}</p>
	{/if}

	<form onsubmit={send}>
		<textarea bind:value={input} {onkeydown} rows="2" placeholder="Message…" aria-label="Message"></textarea>
		{#if streaming}
			<button type="button" onclick={() => controller?.abort()}>Stop</button>
		{:else}
			<button type="submit" disabled={!canSend}>Send</button>
		{/if}
	</form>
</main>

<style>
	:global(html) {
		color-scheme: light dark;
	}

	:global(body) {
		margin: 0;
		font-family: system-ui, sans-serif;
	}

	main {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		box-sizing: border-box;
		height: 100dvh;
		max-width: 44rem;
		margin: 0 auto;
		padding: 1rem;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	h1 {
		margin: 0;
		font-size: 1.15rem;
	}

	.log {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		overflow-y: auto;
	}

	.empty {
		margin: auto;
		opacity: 0.6;
	}

	.error {
		margin: 0;
		color: light-dark(#b91c1c, #fca5a5);
	}

	form {
		display: flex;
		gap: 0.5rem;
	}

	textarea {
		flex: 1;
		padding: 0.6rem;
		border: 1px solid light-dark(#ccc, #555);
		border-radius: 0.6rem;
		font: inherit;
		resize: none;
	}

	button {
		padding: 0.5rem 1rem;
		border: 0;
		border-radius: 0.6rem;
		background: #4f46e5;
		color: white;
		font: inherit;
		cursor: pointer;
	}

	button.secondary {
		background: transparent;
		color: inherit;
		border: 1px solid light-dark(#ccc, #555);
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
