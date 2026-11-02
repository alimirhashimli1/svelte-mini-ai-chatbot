import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	ANTHROPIC_API_KEY: {
		description: 'Claude API key. Server only, never sent to the browser.',
		schema: (value) => value || undefined
	}
});
