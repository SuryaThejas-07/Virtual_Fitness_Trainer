/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_CHATBOT_API_KEY?: string;
	readonly VITE_CHATBOT_API_URL?: string;
	readonly VITE_CHATBOT_MODEL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
