import Anthropic from '@anthropic-ai/sdk';
import { error } from '@sveltejs/kit';
import { ANTHROPIC_API_KEY } from '$app/env/private';
import type { RequestHandler } from './$types';

// Token limits: every request resends the whole history, so these bound its cost.
const MAX_OUTPUT_TOKENS = 4096;
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 8000;

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

function isValidHistory(value: unknown): value is { role: 'user' | 'assistant'; content: string }[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.at(-1)?.role === 'user' &&
		value.every(
			(m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string' && m.content.trim()
		)
	);
}

function friendlyError(err: unknown): { status: number; message: string } {
	if (err instanceof Anthropic.AuthenticationError) {
		return { status: 401, message: 'Invalid API key. Check ANTHROPIC_API_KEY in .env.' };
	}
	if (err instanceof Anthropic.RateLimitError) {
		return { status: 429, message: 'Rate limited. Wait a moment and try again.' };
	}
	if (err instanceof Anthropic.APIConnectionError) {
		return { status: 502, message: 'Could not reach the Claude API.' };
	}
	if (err instanceof Anthropic.APIError) {
		return { status: 502, message: `Claude API error: ${err.message}` };
	}
	return { status: 500, message: 'Could not start the request. Is ANTHROPIC_API_KEY set in .env?' };
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const messages = body?.messages;

	if (!isValidHistory(messages)) error(400, 'Invalid messages.');
	if (messages.length > MAX_MESSAGES) error(413, 'This chat is too long. Start a new chat.');
	if (messages.some((m) => m.content.length > MAX_MESSAGE_CHARS)) {
		error(413, `Messages are limited to ${MAX_MESSAGE_CHARS} characters.`);
	}

	const stream = client.beta.messages.stream({
		model: 'claude-opus-5-5',
		max_tokens: MAX_OUTPUT_TOKENS,
		output_config: { effort: 'low' },
		cache_control: { type: 'ephemeral' },
		betas: ['server-side-fallback-2026-07-01'],
		fallbacks: 'default',
		system: 'You are a helpful assistant. Keep answers concise unless asked for detail.',
		messages
	});

	// Wait for the API to accept the request so failures become real HTTP errors.
	try {
		await stream.withResponse();
	} catch (err) {
		console.error(err);
		const { status, message } = friendlyError(err);
		error(status, message);
	}

	const encoder = new TextEncoder();
	const responseBody = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for await (const event of stream) {
					if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
						controller.enqueue(encoder.encode(event.delta.text));
					}
				}

				const final = await stream.finalMessage();
				console.log('tokens', final.usage);
				if (final.stop_reason === 'max_tokens') {
					controller.enqueue(encoder.encode('\n\n[Reply cut off at the token limit.]'));
				} else if (final.stop_reason === 'refusal') {
					controller.enqueue(encoder.encode('\n\n[Claude declined to answer this.]'));
				}
				controller.close();
			} catch (err) {
				// A client disconnect lands in cancel() below, so only report real failures.
				if (!stream.aborted) {
					console.error(err);
					controller.error(err);
				}
			}
		},
		// The browser stopped reading: abort upstream so we stop paying for output.
		cancel() {
			stream.abort();
		}
	});

	return new Response(responseBody, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }
	});
};
