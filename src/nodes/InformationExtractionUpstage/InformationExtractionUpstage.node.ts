import type {
	IExecuteFunctions,
	INodeType,
	INodeTypeDescription,
	INodeExecutionData,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';

export class InformationExtractionUpstage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Upstage Information Extraction',
		name: 'informationExtractionUpstage',
		icon: 'file:upstage_v2.svg',
		group: ['transform', '@n8n/n8n-nodes-langchain'],
		version: 1,
		description: 'Extract structured data from documents/images using Upstage Information Extraction',
		defaults: { name: 'Upstage Information Extraction' },
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [{ name: 'upstageApi', required: true }],
		properties: [
			// 입력 방식
			{
				displayName: 'Input Type',
				name: 'inputType',
				type: 'options',
				options: [
					{ name: 'Binary (from previous node)', value: 'binary' },
					{ name: 'Image URL', value: 'url' },
				],
				default: 'binary',
			},

			// 바이너리일 때
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'document',
				placeholder: 'e.g. document, data, file',
				description: 'Name of the binary property that contains the file',
				displayOptions: { show: { inputType: ['binary'] } },
			},

			// URL일 때
			{
				displayName: 'Image URL',
				name: 'imageUrl',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/sample.png',
				displayOptions: { show: { inputType: ['url'] } },
			},

			// 모델
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				options: [
					{ name: 'information-extract (recommended)', value: 'information-extract' },
				],
				default: 'information-extract',
			},

			// JSON 스키마
			{
				displayName: 'Schema Name',
				name: 'schemaName',
				type: 'string',
				default: 'document_schema',
				description: 'Name for the JSON schema in response_format',
			},
			{
				displayName: 'JSON Schema (object)',
				name: 'json_schema',
				type: 'json',
				default: '{ "type": "object", "properties": {} }',
				description: 'Target JSON schema for extraction (object schema)',
			},

			// Chunking 옵션
			{
				displayName: 'Pages per Chunk',
				name: 'pagesPerChunk',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'Chunk pages to improve performance (recommended for 30+ pages). 0 to disable.',
			},

			// 반환 방식
			{
				displayName: 'Return',
				name: 'returnMode',
				type: 'options',
				options: [
					{ name: 'Extracted JSON Only', value: 'extracted' },
					{ name: 'Full Response', value: 'full' },
				],
				default: 'extracted',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const inputType = this.getNodeParameter('inputType', i) as string;
				const model = this.getNodeParameter('model', i) as string;
				const schemaName = this.getNodeParameter('schemaName', i) as string;
				const schemaRaw = this.getNodeParameter('json_schema', i) as string;
				const pagesPerChunk = this.getNodeParameter('pagesPerChunk', i, 0) as number;
				const returnMode = this.getNodeParameter('returnMode', i) as string;

				// 스키마 파싱
				let schemaObj: any;
				try {
					schemaObj = typeof schemaRaw === 'string' ? JSON.parse(schemaRaw) : schemaRaw;
				} catch {
					throw new Error('Invalid JSON schema provided');
				}

				// messages 구성
				let dataUrlOrHttp: string;
				if (inputType === 'binary') {
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
					const item = items[i];
					if (!item.binary || !item.binary[binaryPropertyName]) {
						throw new Error(`No binary data found in property "${binaryPropertyName}".`);
					}
					const binaryData = item.binary[binaryPropertyName];
					const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
					const mime = binaryData.mimeType || 'application/octet-stream';
					const base64 = buffer.toString('base64');
					dataUrlOrHttp = `data:${mime};base64,${base64}`;
				} else {
					dataUrlOrHttp = this.getNodeParameter('imageUrl', i) as string;
					if (!dataUrlOrHttp) throw new Error('Image URL is required.');
				}

				const requestBody: any = {
					model,
					messages: [
						{
							role: 'user',
							content: [
								{
									type: 'image_url',
									image_url: { url: dataUrlOrHttp },
								},
							],
						},
					],
					response_format: {
						type: 'json_schema',
						json_schema: {
							name: schemaName || 'document_schema',
							schema: schemaObj,
						},
					},
				};

				// chunking 옵션 (선택)
				if (pagesPerChunk && pagesPerChunk > 0) {
					requestBody.chunking = { pages_per_chunk: pagesPerChunk };
				}

				const requestOptions: IHttpRequestOptions = {
					method: 'POST',
					url: 'https://api.upstage.ai/v1/information-extraction',
					body: requestBody,
					json: true,
				};

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'upstageApi',
					requestOptions,
				);

				if (returnMode === 'full') {
					returnData.push({ json: response, pairedItem: { item: i } });
				} else {
					// Extracted JSON 파싱
					const content = response?.choices?.[0]?.message?.content ?? '';
					let extracted: any;
					try {
						extracted = content ? JSON.parse(content) : {};
					} catch {
						// 콘텐츠가 JSON 문자열이 아닐 수 있으므로, 실패 시 원문 반환
						extracted = { _raw: content };
					}

					returnData.push({
						json: {
							extracted,
							model: response?.model,
							usage: response?.usage,
							full_response: response,
						},
						pairedItem: { item: i },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message || 'Unknown error' },
						pairedItem: { item: i },
					});
				} else {
					throw error;
				}
			}
		}

		return [returnData];
	}
}
