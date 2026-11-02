<script lang="ts">
	let { role, content }: { role: 'user' | 'assistant'; content: string } = $props();
</script>

<div class="message {role}">
	{#if content}
		{content}
	{:else}
		<span class="thinking">Thinking…</span>
	{/if}
</div>

<style>
	.message {
		max-width: 80%;
		padding: 0.6rem 0.9rem;
		border-radius: 0.9rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		line-height: 1.5;
	}

	.user {
		align-self: flex-end;
		background: #4f46e5;
		color: white;
	}

	.assistant {
		align-self: flex-start;
		background: light-dark(#f1f1f4, #2a2a30);
	}

	.thinking {
		opacity: 0.6;
	}
</style>
