import type {
	ISupplyDataFunctions,
	INodeType,
	INodeTypeDescription,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export class LmChatModelUpstage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Upstage Solar Chat Model',
		name: 'lmChatModelUpstage',
		icon: 'file:upstage_v2.svg',
		group: ['@n8n/n8n-nodes-langchain'],
		version: 1,
		description: 'Language Model for AI Agent - Upstage Solar LLM',
		defaults: {
			name: 'Upstage Solar Chat Model',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://js.langchain.com/docs/modules/model_io/models/chat/',
					},
				],
			},
		},
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionType.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'upstageApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				description: 'The Upstage Solar model to use',
				default: 'solar-mini',
				options: [
					{
						name: 'Solar Mini',
						value: 'solar-mini',
						description: 'Fast and efficient model for basic tasks',
					},
					{
						name: 'Solar Pro',
						value: 'solar-pro',
						description: 'Powerful model for complex tasks',
					},
					{
						name: 'Solar Pro 2',
						value: 'solar-pro2',
						description: 'Latest and most advanced Solar model',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				description: 'Additional options to configure',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'Temperature',
						name: 'temperature',
						default: 0.7,
						typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 1 },
						description: 'Controls randomness. Higher values make output more random.',
						type: 'number',
					},
					{
						displayName: 'Max Tokens',
						name: 'maxTokens',
						default: 1000,
						typeOptions: { minValue: 1, maxValue: 4000 },
						description: 'Maximum number of tokens to generate',
						type: 'number',
					},
					{
						displayName: 'Top P',
						name: 'topP',
						default: 0.9,
						typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
						description: 'Nucleus sampling parameter',
						type: 'number',
					},
					{
						displayName: 'Reasoning Effort',
						name: 'reasoningEffort',
						type: 'options',
						options: [
							{
								name: 'Low',
								value: 'low',
								description: 'Disable reasoning for faster responses',
							},
							{
								name: 'High',
								value: 'high',
								description: 'Enable reasoning for complex tasks (may increase token usage)',
							},
						],
						default: 'low',
						description: 'Controls the level of reasoning effort. Only applicable to Reasoning models.',
					},
					{
						displayName: 'Frequency Penalty',
						name: 'frequencyPenalty',
						type: 'number',
						default: 0,
						typeOptions: { minValue: -2, maxValue: 2, numberPrecision: 2 },
						description: 'Controls model tendency to repeat tokens. Positive values reduce repetition, negative values allow more repetition.',
					},
					{
						displayName: 'Presence Penalty',
						name: 'presencePenalty',
						type: 'number',
						default: 0,
						typeOptions: { minValue: -2, maxValue: 2, numberPrecision: 2 },
						description: 'Adjusts tendency to include tokens already present. Positive values encourage new ideas, negative values maintain consistency.',
					},
				],
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('upstageApi');
		const model = this.getNodeParameter('model', itemIndex) as string;
		const options = this.getNodeParameter('options', itemIndex, {}) as {
			temperature?: number;
			maxTokens?: number;
			topP?: number;
			reasoningEffort?: string;
			frequencyPenalty?: number;
			presencePenalty?: number;
		};

		// Create a custom chat model that implements LangChain's interface
		const chatModel = new UpstageChat({
			apiKey: credentials.apiKey as string,
			model,
			temperature: options.temperature,
			maxTokens: options.maxTokens,
			topP: options.topP,
			reasoningEffort: options.reasoningEffort,
			frequencyPenalty: options.frequencyPenalty,
			presencePenalty: options.presencePenalty,
		});

		return {
			response: chatModel,
		};
	}
}

// Custom LangChain Chat Model implementation for Upstage Solar
import { ChatOpenAI } from '@langchain/openai';

class UpstageChat extends ChatOpenAI {
	constructor(fields: {
		apiKey: string;
		model: string;
		temperature?: number;
		maxTokens?: number;
		topP?: number;
		reasoningEffort?: string;
		frequencyPenalty?: number;
		presencePenalty?: number;
	}) {
		const modelKwargs: any = {};
		if (fields.reasoningEffort) modelKwargs.reasoning_effort = fields.reasoningEffort;
		if (fields.frequencyPenalty !== undefined) modelKwargs.frequency_penalty = fields.frequencyPenalty;
		if (fields.presencePenalty !== undefined) modelKwargs.presence_penalty = fields.presencePenalty;

		super({
			openAIApiKey: fields.apiKey,
			modelName: fields.model,
			temperature: fields.temperature,
			maxTokens: fields.maxTokens,
			topP: fields.topP,
			modelKwargs,
			configuration: {
				baseURL: 'https://api.upstage.ai/v1/solar',
			},
		});
	}
}
