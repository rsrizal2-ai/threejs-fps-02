// Round and match flow plus the economy: one source of truth for phase, score,
// timer and money. main.js asks this module what phase it is in and what a round
// ending means; the module never touches the scene.
export const BUY_SECONDS = 20;
export const ROUND_SECONDS = 100;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;

export function createRounds() {
  const state = {
    phase: 'buy', // buy | combat | roundEnd | matchEnd
    round: 1,
    scoreAttack: 0,
    scoreDefend: 0,
    money: START_MONEY,
    phaseLeft: BUY_SECONDS,
    message: '',
    reason: '',
    matchWinner: null,
  };

  function startMatch() {
    state.phase = 'buy';
    state.round = 1;
    state.scoreAttack = 0;
    state.scoreDefend = 0;
    state.money = START_MONEY;
    state.phaseLeft = BUY_SECONDS;
    state.message = 'Round 1 — buy your gear';
    state.reason = '';
    state.matchWinner = null;
  }

  function startRound() {
    state.phase = 'buy';
    state.phaseLeft = BUY_SECONDS;
    state.message = `Round ${state.round} — buy your gear`;
    state.reason = '';
  }

  function startCombat() {
    state.phase = 'combat';
    state.phaseLeft = ROUND_SECONDS;
    state.message = 'Plant the bomb at A or B';
  }

  // Returns 'matchEnd' when the match is decided, else 'roundEnd'.
  function endRound(winner, reason) {
    if (winner === 'attack') state.scoreAttack += 1;
    else state.scoreDefend += 1;
    state.money += winner === 'attack' ? WIN_REWARD : LOSS_REWARD;
    state.reason = reason;
    if (state.scoreAttack >= WIN_ROUNDS || state.scoreDefend >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'matchEnd';
      state.matchWinner = state.scoreAttack > state.scoreDefend ? 'attack' : 'defend';
      state.message = state.matchWinner === 'attack' ? 'Vanguard takes the match' : 'Sentinel takes the match';
      return 'matchEnd';
    }
    state.phase = 'roundEnd';
    state.phaseLeft = 4;
    state.message = winner === 'attack' ? 'Round won — Vanguard' : 'Round lost — Sentinel';
    return 'roundEnd';
  }

  function nextRound() {
    state.round += 1;
    startRound();
  }

  return {
    state,
    startMatch,
    startRound,
    startCombat,
    endRound,
    nextRound,
    // Returns 'combat' when the buy phase runs out, else null.
    tick(dt) {
      if (state.phase === 'buy' || state.phase === 'combat' || state.phase === 'roundEnd') {
        state.phaseLeft -= dt;
        if (state.phaseLeft <= 0) {
          if (state.phase === 'buy') { startCombat(); return 'combat'; }
          if (state.phase === 'roundEnd') { nextRound(); return 'nextRound'; }
          return 'timeUp';
        }
      }
      return null;
    },
    awardKill() { state.money += KILL_REWARD; },
    awardPlant() { state.money += PLANT_REWARD; },
    spend(amount) {
      if (state.money < amount) return false;
      state.money -= amount;
      return true;
    },
  };
}
