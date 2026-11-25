import type { AgentToolId } from '../../src/shared/types.ts';

export interface SandboxedToolSpec {
  id: AgentToolId;
  name: string;
  description: string;
  parametersHint: string;
  sensitive: boolean;
}

export const SANDBOXED_TOOLS: SandboxedToolSpec[] = [
  {
    id: 'knowledge_search',
    name: 'Knowledge Base Search',
    description: 'Searches synthetic enterprise runbooks, SLA policies, and compliance documentation.',
    parametersHint: '{ "query": string }',
    sensitive: false,
  },
  {
    id: 'calculator',
    name: 'Safe Arithmetic Calculator',
    description: 'Evaluates mathematical expressions using a sandboxed parser (no code execution).',
    parametersHint: '{ "expression": string }',
    sensitive: false,
  },
  {
    id: 'sql_query_sandbox',
    name: 'Sandboxed Order & Customer Lookup',
    description: 'Queries synthetic read-only CRM orders, invoices, and SLA records.',
    parametersHint: '{ "entity": "orders" | "customers" | "sla", "filter": string }',
    sensitive: false,
  },
  {
    id: 'ticket_api',
    name: 'Support Ticket & Refund API (Sensitive)',
    description: 'Reads support tickets or drafts escalations/refunds (refunds require human approval).',
    parametersHint: '{ "action": "get_ticket" | "draft_escalation" | "issue_refund", "ticketId": string, "amount"?: number }',
    sensitive: true,
  },
  {
    id: 'code_sandbox_check',
    name: 'Static Code & Schema Validator',
    description: 'Checks TypeScript/Python snippets or JSON payloads for syntax and safety issues.',
    parametersHint: '{ "language": "json" | "typescript" | "python", "snippet": string }',
    sensitive: false,
  },
];

const SYNTHETIC_KB = [
  {
    topic: 'refund_policy',
    title: 'Enterprise Refund & SLA Credit Policy v2.4',
    content:
      'Standard refunds under $250 may be drafted automatically, while refunds >= $250 or SLA breach credits require explicit human approval before execution. Enterprise SLA uptime target is 99.95% monthly; breach below 99.9% entitles 15% monthly invoice credit.',
  },
  {
    topic: 'security_governance',
    title: 'AI Agent Governance & PII Policy',
    content:
      'Agents must never echo SSNs, API keys, or unmasked customer emails. Any external write action or financial refund must route through human-in-the-loop approval.',
  },
  {
    topic: 'incident_runbook',
    title: 'Latency Spike Mitigation Runbook',
    content:
      'If p95 API latency exceeds 2200ms for 5 minutes, check connection pool saturation, enable read-replica routing, and cap batch concurrency to 4 workers.',
  },
  {
    topic: 'pricing_tiers',
    title: 'Cloud Platform Pricing Reference',
    content:
      'Starter tier: $0/mo (10k requests). Growth tier: $49/mo (250k requests, $0.18 per extra 10k). Enterprise tier: $399/mo with dedicated VPC.',
  },
];

const SYNTHETIC_ORDERS = [
  { orderId: 'ORD-8841', customer: 'Apex Logistics', amount: 1420, status: 'delivered', slaHours: 24, actualHours: 31 },
  { orderId: 'ORD-8842', customer: 'Northwind Bio', amount: 185, status: 'pending', slaHours: 48, actualHours: 12 },
  { orderId: 'ORD-8843', customer: 'Helios Energy', amount: 4800, status: 'disputed', slaHours: 12, actualHours: 29 },
];

const SYNTHETIC_TICKETS = [
  { ticketId: 'TKT-401', customer: 'Apex Logistics', issue: 'Late shipment SLA credit request', orderId: 'ORD-8841', severity: 'high' },
  { ticketId: 'TKT-402', customer: 'Northwind Bio', issue: 'Invoice tax ID update', orderId: 'ORD-8842', severity: 'low' },
  { ticketId: 'TKT-403', customer: 'Helios Energy', issue: 'Production outage compensation inquiry', orderId: 'ORD-8843', severity: 'critical' },
];

/**
 * Recursive-descent safe arithmetic parser (+, -, *, /, parentheses, decimals).
 * Zero eval() or Function() usage.
 */
function safeEvaluateMath(expr: string): number {
  const cleaned = expr.replace(/[^0-9+\-*/().\s]/g, '').trim();
  if (!cleaned) throw new Error('Empty or invalid arithmetic expression');
  let pos = 0;

  function skipWs() {
    while (pos < cleaned.length && cleaned[pos] === ' ') pos++;
  }

  function parseExpression(): number {
    let val = parseTerm();
    while (true) {
      skipWs();
      if (cleaned[pos] === '+') {
        pos++;
        val += parseTerm();
      } else if (cleaned[pos] === '-') {
        pos++;
        val -= parseTerm();
      } else {
        break;
      }
    }
    return val;
  }

  function parseTerm(): number {
    let val = parseFactor();
    while (true) {
      skipWs();
      if (cleaned[pos] === '*') {
        pos++;
        val *= parseFactor();
      } else if (cleaned[pos] === '/') {
        pos++;
        const denom = parseFactor();
        if (denom === 0) throw new Error('Division by zero');
        val /= denom;
      } else {
        break;
      }
    }
    return val;
  }

  function parseFactor(): number {
    skipWs();
    if (cleaned[pos] === '(') {
      pos++;
      const val = parseExpression();
      skipWs();
      if (cleaned[pos] !== ')') throw new Error('Mismatched parenthesis');
      pos++;
      return val;
    }
    if (cleaned[pos] === '-') {
      pos++;
      return -parseFactor();
    }
    const start = pos;
    while (pos < cleaned.length && /[0-9.]/.test(cleaned[pos])) pos++;
    const numStr = cleaned.slice(start, pos);
    const parsed = Number(numStr);
    if (!numStr || !Number.isFinite(parsed)) {
      throw new Error(`Invalid number at position ${start}`);
    }
    return parsed;
  }

  const result = parseExpression();
  skipWs();
  if (pos < cleaned.length) {
    throw new Error(`Unexpected token "${cleaned[pos]}"`);
  }
  return Math.round(result * 10000) / 10000;
}

export function executeSandboxedTool(
  toolName: string,
  args: Record<string, unknown>,
  allowedTools: AgentToolId[],
  humanApprovalRequired: string[]
): {
  output: Record<string, unknown>;
  success: boolean;
  authorized: boolean;
  requiresApproval: boolean;
  latencyMs: number;
  error?: string;
} {
  const start = Date.now();

  if (!allowedTools.includes(toolName as AgentToolId)) {
    return {
      output: { error: `Unauthorized tool "${toolName}" is not in agent allowlist.` },
      success: false,
      authorized: false,
      requiresApproval: false,
      latencyMs: Date.now() - start + 4,
      error: `Unauthorized tool access blocked: ${toolName}`,
    };
  }

  try {
    if (toolName === 'knowledge_search') {
      const query = String(args.query ?? '').toLowerCase();
      const terms = query.split(/\s+/).filter((t) => t.length > 2);
      const matches = SYNTHETIC_KB.filter(
        (doc) =>
          terms.length === 0 ||
          terms.some(
            (t) =>
              doc.title.toLowerCase().includes(t) ||
              doc.content.toLowerCase().includes(t) ||
              doc.topic.toLowerCase().includes(t)
          )
      );
      return {
        output: {
          results: (matches.length ? matches : SYNTHETIC_KB.slice(0, 2)).map((m) => ({
            title: m.title,
            excerpt: m.content,
          })),
        },
        success: true,
        authorized: true,
        requiresApproval: false,
        latencyMs: Date.now() - start + 14,
      };
    }

    if (toolName === 'calculator') {
      const expr = String(args.expression ?? '');
      const value = safeEvaluateMath(expr);
      return {
        output: { expression: expr, result: value },
        success: true,
        authorized: true,
        requiresApproval: false,
        latencyMs: Date.now() - start + 3,
      };
    }

    if (toolName === 'sql_query_sandbox') {
      const entity = String(args.entity ?? 'orders').toLowerCase();
      const filter = String(args.filter ?? '').toLowerCase();
      if (entity === 'sla' || entity === 'orders') {
        const rows = SYNTHETIC_ORDERS.filter(
          (o) =>
            !filter ||
            o.orderId.toLowerCase().includes(filter) ||
            o.customer.toLowerCase().includes(filter) ||
            o.status.toLowerCase().includes(filter)
        );
        return {
          output: { table: 'sandbox_orders', rowCount: rows.length, rows },
          success: true,
          authorized: true,
          requiresApproval: false,
          latencyMs: Date.now() - start + 19,
        };
      }
      return {
        output: { table: 'sandbox_tickets', rowCount: SYNTHETIC_TICKETS.length, rows: SYNTHETIC_TICKETS },
        success: true,
        authorized: true,
        requiresApproval: false,
        latencyMs: Date.now() - start + 16,
      };
    }

    if (toolName === 'ticket_api') {
      const action = String(args.action ?? 'get_ticket');
      const ticketId = String(args.ticketId ?? 'TKT-401');
      if (action === 'issue_refund') {
        const needsApproval =
          humanApprovalRequired.includes('issue_refund') ||
          humanApprovalRequired.includes('ticket_api') ||
          Number(args.amount ?? 0) >= 250;
        if (needsApproval) {
          return {
            output: {
              status: 'pending_human_approval',
              ticketId,
              amount: args.amount ?? null,
              message: 'Action paused: human-in-the-loop approval required before issuing financial refund.',
            },
            success: true,
            authorized: true,
            requiresApproval: true,
            latencyMs: Date.now() - start + 12,
          };
        }
      }
      const ticket = SYNTHETIC_TICKETS.find((t) => t.ticketId === ticketId) ?? SYNTHETIC_TICKETS[0];
      return {
        output: { action, ticket, status: 'ok' },
        success: true,
        authorized: true,
        requiresApproval: false,
        latencyMs: Date.now() - start + 15,
      };
    }

    if (toolName === 'code_sandbox_check') {
      const language = String(args.language ?? 'json');
      const snippet = String(args.snippet ?? '');
      if (language === 'json') {
        try {
          JSON.parse(snippet);
          return {
            output: { valid: true, language, issues: [] },
            success: true,
            authorized: true,
            requiresApproval: false,
            latencyMs: Date.now() - start + 5,
          };
        } catch (err) {
          return {
            output: {
              valid: false,
              language,
              issues: [err instanceof Error ? err.message : 'Invalid JSON'],
            },
            success: false,
            authorized: true,
            requiresApproval: false,
            latencyMs: Date.now() - start + 5,
            error: 'JSON validation failed',
          };
        }
      }
      const hasUnsafeEval = /\beval\(|\bexec\(|child_process/.test(snippet);
      return {
        output: {
          valid: !hasUnsafeEval,
          language,
          issues: hasUnsafeEval ? ['Detected unsafe dynamic execution primitive'] : [],
        },
        success: !hasUnsafeEval,
        authorized: true,
        requiresApproval: false,
        latencyMs: Date.now() - start + 8,
      };
    }

    return {
      output: { error: `Unknown tool: ${toolName}` },
      success: false,
      authorized: false,
      requiresApproval: false,
      latencyMs: 5,
      error: `Unknown tool: ${toolName}`,
    };
  } catch (err) {
    return {
      output: { error: err instanceof Error ? err.message : String(err) },
      success: false,
      authorized: true,
      requiresApproval: false,
      latencyMs: Date.now() - start + 5,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
