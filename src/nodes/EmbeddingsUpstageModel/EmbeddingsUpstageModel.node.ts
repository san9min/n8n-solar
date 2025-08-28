import type {
	ISupplyDataFunctions,
	INodeType,
	INodeTypeDescription,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';

export class EmbeddingsUpstageModel implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Upstage Embeddings Model',
		name: 'embeddingsUpstageModel',
		icon: 'file:upstage_v2.svg',
		group: ['@n8n/n8n-nodes-langchain'],
		version: 1,
			description: 'Embedding Model for Vector DB - Upstage Solar Embeddings. Supports up to 100 strings per request with max 204,800 total tokens. Each text should be under 4000 tokens (optimal: under 512 tokens).',
		defaults: {
			name: 'Upstage Embeddings Model',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Embeddings', 'Root Nodes'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://js.langchain.com/docs/modules/data_connection/text_embedding/',
					},
				],
			},
		},
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionType.AiEmbedding],
		outputNames: ['Embeddings'],
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
				description: 'The Upstage embedding model to use',
				default: 'embedding-query',
				options: [
					{
						name: 'Embedding Query',
						value: 'embedding-query',
						description: 'Optimized for search queries and questions',
					},
					{
						name: 'Embedding Passage',
						value: 'embedding-passage',
						description: 'Optimized for documents and passages',
					},
				],
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('upstageApi');
		const model = this.getNodeParameter('model', itemIndex) as string;

		// Create a custom embedding model that implements LangChain's interface
		const embeddingModel = new UpstageEmbeddings({
			apiKey: credentials.apiKey as string,
			model,
		});

		return {
			response: embeddingModel,
		};
	}
}

// Custom LangChain Embeddings implementation for Upstage Solar
import { Embeddings } from '@langchain/core/embeddings';

class UpstageEmbeddings extends Embeddings {
	private apiKey: string;
	private model: string;
	private baseURL: string = 'https://api.upstage.ai/v1';

	constructor(fields: {
		apiKey: string;
		model: string;
	}) {
		super({});
		this.apiKey = fields.apiKey;
		this.model = fields.model;
	}

	async embedDocuments(texts: string[]): Promise<number[][]> {
		return this.callUpstageAPI(texts);
	}

	async embedQuery(text: string): Promise<number[]> {
		const result = await this.callUpstageAPI([text]);
		return result[0];
	}

	private async callUpstageAPI(input: string[]): Promise<number[][]> {
		try {
			// Validate and clean input
			const cleanInput = input
				.filter(text => text && typeof text === 'string' && text.trim().length > 0)
				.map(text => text.trim());

			if (cleanInput.length === 0) {
				throw new Error('No valid input texts provided for embedding');
			}

			// Check individual text length (Upstage limit: 4000 tokens per text)
			for (const text of cleanInput) {
				if (text.length > 16000) { // Rough estimate: ~4 chars per token
					console.warn(`Text length ${text.length} might exceed token limit:`, text.substring(0, 100) + '...');
				}
			}

			// Check batch size (Upstage limit: 100 strings)
			if (cleanInput.length > 100) {
				throw new Error(`Too many texts: ${cleanInput.length}. Upstage API supports max 100 strings per request`);
			}

			// Use single string for single input, array for multiple
			const requestBody = {
				model: this.model,
				input: cleanInput.length === 1 ? cleanInput[0] : cleanInput,
			};

			// Debug logging
			console.log('Upstage Embeddings Request:', {
				url: `${this.baseURL}/embeddings`,
				model: this.model,
				inputCount: cleanInput.length,
				inputSample: cleanInput[0]?.substring(0, 100) + (cleanInput[0]?.length > 100 ? '...' : ''),
			});

			const response = await fetch(`${this.baseURL}/embeddings`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorBody = await response.text();
				console.error('Upstage API Error Response:', errorBody);
				console.error('Request Body:', JSON.stringify(requestBody, null, 2));
				throw new Error(`Upstage API error: ${response.status} - ${errorBody}`);
			}

			const data: any = await response.json();
			console.log('Upstage API Success Response:', {
				model: data.model,
				usage: data.usage,
				dataCount: data.data?.length,
			});
			
			if (!data.data || !Array.isArray(data.data)) {
				throw new Error('Invalid response format from Upstage API');
			}

			// Sort by index to ensure correct order
			const sortedData = data.data.sort((a: any, b: any) => a.index - b.index);
			
			// Ensure we return the same number of embeddings as input texts
			if (sortedData.length !== cleanInput.length) {
				throw new Error(`Expected ${cleanInput.length} embeddings, got ${sortedData.length}`);
			}
			
			return sortedData.map((item: any) => item.embedding);
		} catch (error) {
			throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
