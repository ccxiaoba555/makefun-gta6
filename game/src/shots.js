// Vice Bay — canned scenes for screenshots.
// The page reads ?shot= and ?seed= from its URL and sets the game up in that
// scene before the first frame, so a screenshot always shows the same moment:
//   ?shot=start  the title screen over the living city
//   ?shot=play   driving through traffic on a job (seed 7: a 3-star chase)
//   ?shot=end    the BUSTED screen after a chase gone wrong

export function readShotParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    shot: q.get('shot') || 'start',
    seed: Number(q.get('seed') || '1') || 1,
  };
}

export function applyShot(game, shot, seed) {
  if (shot === 'end') {
    game.showGameOver('busted', { money: 1240, missionsDone: 2 });
    return;
  }
  if (shot === 'play') {
    const chase = seed === 7;
    game.startPlayScene({
      inCar: true,
      wanted: chase ? 3 : 0,
      missionIndex: chase ? 2 : 0,
      missionStage: chase ? 'escape' : 'pickup',
    });
    return;
  }
  game.startMenuScene();
}
