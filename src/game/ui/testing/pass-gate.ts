// Test helper (task 19.4): acknowledges the controller's pending Pass_Device_Gate, if any. Multi-human test drivers
// call it before each human Action, as the person at the device would. It returns whether a gate was acknowledged.

import type { Controller } from '../controller';

export function passGate(ctl: Pick<Controller, 'getModel' | 'acknowledgeGate'>): boolean {
  const model = ctl.getModel();
  const gate = model.gate;
  if (gate === null) return false;
  return ctl.acknowledgeGate({ forSeat: gate.forSeat, purpose: gate.purpose, actionCount: model.actionCount }).ok;
}
