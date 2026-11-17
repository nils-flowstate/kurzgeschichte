// Zentrale Maße der Welt (Meter). Y = oben, Blickrichtung 0° = +Z.
// Straße verläuft entlang X, das Bürogebäude steht nördlich (negatives Z).

export const FLOOR_H = 3.6;
export const F8 = 8 * FLOOR_H; // 28.8 – Fußboden 8. Stock

export const L = {
  road: { z0: -6, z1: 6 },
  sidewalkN: { z0: -11, z1: -6 },
  sidewalkS: { z0: 6, z1: 11 },
  sideStreet: { x0: -36, x1: -28 }, // Querstraße (Blockecke)
  sideWalkE: { x0: -28, x1: -24 },
  crosswalkX: 19,
  parkingBay: { x0: 5, x1: 16, z0: -8.4, z1: -6 },
  building: { x0: -16, x1: 16, z0: -41, z1: -11, floors: 12 },
  neighbor: { x0: -24, x1: -16 },
  core: { x0: -4, x1: 4, z0: -41, z1: -33.5 },
  elevator: { x: -1.4, zDoor: -31, zCab: -32.3, w: 2.2, d: 2.4, h: 2.5 },
  lobby: {
    turnstileZ: -17,
    reception: [-8, -18.5] as [number, number],
  },
  f8: {
    vestibule: { x0: -5, x1: 3, z0: -31, z1: -27 },
    glassDoorX: -1.4,
    partitionZ: -27,
    rooms: {
      robert: { x0: 4, x1: 7.5, door: 5.6 },
      cfo: { x0: 7.5, x1: 11, door: 9.2 },
      ceo: { x0: 11, x1: 16, door: 12.4 },
    },
    roomsZ0: -41,
    reception: [-5.2, -24.3] as [number, number],
    plant: [10.65, -26.45] as [number, number],
    kitchenX: 15.6,
    island: { x: 13.1, z0: -24.2, z1: -19.4 },
    coffeeMachineZ: -24.6,
    mugShelfZ: -23.0,
    sinkZ: -21.0,
    glassShelfZ: -19.4,
    counterEndZ: -17.4,
    closet: [-11.2, -26.6] as [number, number],
    ceoDesk: [13.6, -35.2] as [number, number],
  },
};
