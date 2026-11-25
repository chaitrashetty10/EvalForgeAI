import { handleRunEvaluationStream } from '../../server/http/evalHandlers.ts';
import type { ApiRequest, ApiResponse } from '../../server/http/evalHandlers.ts';

export const config = {
  maxDuration: 60,
};

export default function handler(req: ApiRequest, res: ApiResponse) {
  return handleRunEvaluationStream(req, res);
}
