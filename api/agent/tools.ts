import { handleAgentTools } from '../../server/http/evalHandlers.ts';
import type { ApiRequest, ApiResponse } from '../../server/http/evalHandlers.ts';

export default function handler(req: ApiRequest, res: ApiResponse) {
  return handleAgentTools(req, res);
}
