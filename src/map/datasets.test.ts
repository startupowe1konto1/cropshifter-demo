// Every Polish field outline comes from GUGiK ULDK, so the registry (source chips, References list) must list it (H19).
import { datasets as registry } from '../app/datasets';
import { ULDK_URL } from './parcels/uldk';

describe('map datasets', () => {
  it('registers GUGiK ULDK, the service that outlines every Polish parcel', () => {
    const uldk = registry.find((d) => d.id === 'gugik-uldk');
    expect(uldk).toBeDefined();
    // The entry points at the same service the parcel lookup calls.
    expect(uldk!.url).toBe(ULDK_URL);
    expect(uldk!.provider).toBe('GUGiK');
    expect(uldk!.nasa).toBe(false);
    expect(uldk!.kind).toBe('observation');
  });
});
