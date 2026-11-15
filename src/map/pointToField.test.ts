import { pointToField } from './pointToField';

describe('pointToField', () => {
  it('builds a 4 ha square around a point near Poznań, in Poland', () => {
    const field = pointToField(52.45, 17.1);
    expect(field.country).toBe('PL');
    expect(field.name).toBe('Field at 52.4500, 17.1000');
    expect(field.centroid).toEqual({ lat: 52.45, lon: 17.1 });
    expect(Math.abs(field.areaHa - 4)).toBeLessThan(0.04);
    expect(field.polygon.type).toBe('Polygon');
    const ring = field.polygon.coordinates[0]!;
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });

  it('guesses US for a point in Iowa', () => {
    expect(pointToField(42.03, -93.63).country).toBe('US');
  });

  it('guesses OTHER outside Poland and the contiguous USA', () => {
    expect(pointToField(48.85, 2.35).country).toBe('OTHER'); // Paris
    expect(pointToField(61.2, -149.9).country).toBe('OTHER'); // Anchorage, not contiguous USA
  });

  it('gives the same id for the same point and different ids for different points', () => {
    expect(pointToField(52.45, 17.1).id).toBe(pointToField(52.45, 17.1).id);
    expect(pointToField(52.45, 17.1).id).not.toBe(pointToField(52.46, 17.1).id);
  });

  it('keeps the ring counterclockwise in [lon, lat]', () => {
    const ring = pointToField(42.03, -93.63).polygon.coordinates[0]!;
    let twiceArea = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i]!;
      const [x2, y2] = ring[i + 1]!;
      twiceArea += x1! * y2! - x2! * y1!;
    }
    expect(twiceArea).toBeGreaterThan(0);
  });
});
