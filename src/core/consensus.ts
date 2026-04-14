import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { agentTasks, agentEvaluations } from '../db/schema.js';

export interface ConsensusResult {
  complete: boolean;
  verdict?: 'approve' | 'reject' | 'revise';
  averageScore?: number;
  evaluations: {
    agentId: string;
    verdict: string;
    score: number | null;
    reasoning: string | null;
  }[];
}

/**
 * Check if all consensus evaluations are in for a task,
 * and if so, aggregate the result based on strategy.
 */
export function evaluateConsensus(taskId: number): ConsensusResult {
  const db = getDb();

  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task || !task.consensus) {
    return { complete: false, evaluations: [] };
  }

  const expectedAgents: string[] = task.consensusAgents ? JSON.parse(task.consensusAgents) : [];
  if (expectedAgents.length === 0) {
    return { complete: false, evaluations: [] };
  }

  const evals = db
    .select()
    .from(agentEvaluations)
    .where(eq(agentEvaluations.taskId, taskId))
    .all();

  const evaluations = evals.map(e => ({
    agentId: e.agentId,
    verdict: e.verdict,
    score: e.score,
    reasoning: e.reasoning,
  }));

  // Check if all expected agents have evaluated
  const evaluatedAgents = new Set(evals.map(e => e.agentId));
  const allIn = expectedAgents.every(id => evaluatedAgents.has(id));

  if (!allIn) {
    return { complete: false, evaluations };
  }

  // Aggregate based on strategy
  const strategy = task.consensusStrategy || 'majority';
  let verdict: 'approve' | 'reject' | 'revise';
  let averageScore: number | undefined;

  switch (strategy) {
    case 'unanimous': {
      const allApprove = evals.every(e => e.verdict === 'approve');
      verdict = allApprove ? 'approve' : 'reject';
      break;
    }

    case 'average_score': {
      const scores = evals.filter(e => e.score != null).map(e => e.score!);
      averageScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
      verdict = averageScore >= 50 ? 'approve' : 'reject';
      break;
    }

    case 'majority':
    default: {
      const approves = evals.filter(e => e.verdict === 'approve').length;
      const rejects = evals.filter(e => e.verdict === 'reject').length;
      const revises = evals.filter(e => e.verdict === 'revise').length;

      if (approves > rejects && approves > revises) {
        verdict = 'approve';
      } else if (revises > 0 && revises >= rejects) {
        verdict = 'revise';
      } else {
        verdict = 'reject';
      }
      break;
    }
  }

  // Store result
  const consensusResult = { verdict, averageScore, evaluations };
  db.update(agentTasks)
    .set({
      consensusResult: JSON.stringify(consensusResult),
      status: verdict === 'approve' ? 'done' : 'failed',
      completedAt: new Date(),
    })
    .where(eq(agentTasks.id, taskId))
    .run();

  return { complete: true, verdict, averageScore, evaluations };
}
