import { describe, it, expect } from 'vitest';
import { getTeamAgentIds, agentBelongsToTeam } from '../src/lib/team-utils.js';
import { createTestTeam, createTestAgent } from './helpers.js';

describe('Team Utils', () => {
  describe('getTeamAgentIds', () => {
    it('returns agent IDs for team', () => {
      const team = createTestTeam('Utils Team A');
      const a1 = createTestAgent(team.id);
      const a2 = createTestAgent(team.id);
      const ids = getTeamAgentIds(team.id);
      expect(ids).toContain(a1);
      expect(ids).toContain(a2);
      expect(ids).toHaveLength(2);
    });

    it('returns empty array for team with no agents', () => {
      const team = createTestTeam('Utils Empty Team');
      expect(getTeamAgentIds(team.id)).toEqual([]);
    });

    it('does not include agents from other teams', () => {
      const teamA = createTestTeam('Utils Iso A');
      const teamB = createTestTeam('Utils Iso B');
      createTestAgent(teamA.id);
      const bAgent = createTestAgent(teamB.id);
      const idsA = getTeamAgentIds(teamA.id);
      expect(idsA).not.toContain(bAgent);
    });
  });

  describe('agentBelongsToTeam', () => {
    it('returns true for agent in team', () => {
      const team = createTestTeam('Belongs Team');
      const agentId = createTestAgent(team.id);
      expect(agentBelongsToTeam(agentId, team.id)).toBe(true);
    });

    it('returns false for agent in different team', () => {
      const teamA = createTestTeam('Belongs A');
      const teamB = createTestTeam('Belongs B');
      const agentId = createTestAgent(teamA.id);
      expect(agentBelongsToTeam(agentId, teamB.id)).toBe(false);
    });

    it('returns false for nonexistent agent', () => {
      const team = createTestTeam('Belongs None');
      expect(agentBelongsToTeam('nonexistent', team.id)).toBe(false);
    });
  });
});
