import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

type RequestMessage = { id: number; text: string; model: string; device: 'wasm' | 'webgpu' };
type ResponseMessage = { id: number; vector?: number[]; error?: string };

const workerScope = self as unknown as {
  postMessage(message: ResponseMessage): void;
  onmessage: ((event: MessageEvent<RequestMessage>) => void) | null;
};

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
let loadedModel = '';
let loadedDevice: RequestMessage['device'] | null = null;

async function getExtractor(model: string, device: RequestMessage['device']): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise || loadedModel !== model || loadedDevice !== device) {
    loadedModel = model;
    loadedDevice = device;
    extractorPromise = pipeline('feature-extraction', model, {
      device,
      dtype: device === 'webgpu' ? 'fp16' : 'q4'
    });
  }
  return extractorPromise;
}

workerScope.onmessage = async ({ data }) => {
  try {
    const extractor = await getExtractor(data.model, data.device);
    const output = await extractor(data.text, { pooling: 'mean', normalize: true });
    workerScope.postMessage({ id: data.id, vector: Array.from(output.data as ArrayLike<number>) });
  } catch (error) {
    workerScope.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : 'Browser embedding failed.'
    });
  }
};
