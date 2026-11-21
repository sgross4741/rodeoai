// Rodeo events. Roughstock events have a scored animal; in timed events
// the animal is not judged, so there is no animal score.
export const EVENTS = [
  { id: 'bull_riding', label: 'Bull Riding', roughstock: true,
    focus: 'Staying centered over the bull rope, free arm control, chest up, hips square, adjusting to direction changes and spins.' },
  { id: 'saddle_bronc', label: 'Saddle Bronc Riding', roughstock: true,
    focus: 'Mark-out, spurring rhythm from neck to cantle in time with the horse, upright posture with slight lean back, rein hand control.' },
  { id: 'bareback', label: 'Bareback Riding', roughstock: true,
    focus: 'Mark-out, laid-back upper body, spurring rhythm, staying square over the rigging, free arm control.' },
  { id: 'barrel_racing', label: 'Barrel Racing', roughstock: false,
    focus: 'Rider staying centered and quiet in the saddle, upper body position through turns, sitting deep, eyes and shoulders leading the turn.' },
  { id: 'tie_down_roping', label: 'Tie-Down Roping', roughstock: false,
    focus: 'Position in the saddle at the start, swing and delivery, dismount timing and footwork, flank and tie efficiency.' },
  { id: 'team_roping', label: 'Team Roping', roughstock: false,
    focus: 'Seat and balance in the saddle, swing mechanics, delivery timing, dally, and horse position (header or heeler).' },
  { id: 'steer_wrestling', label: 'Steer Wrestling', roughstock: false,
    focus: 'Getting down from the horse, body position on the steer, hip placement, and leverage for the turn and throw.' },
  { id: 'breakaway_roping', label: 'Breakaway Roping', roughstock: false,
    focus: 'Seat and balance in the saddle, swing mechanics, delivery timing and accuracy, staying centered as the horse stops.' },
];

export function getEvent(id) {
  return EVENTS.find((e) => e.id === id) || null;
}
