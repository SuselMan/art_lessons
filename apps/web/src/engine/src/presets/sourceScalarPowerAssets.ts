import type {SourceScalarPowerMode} from './sourceScalarPowerTable'
export interface SourceScalarPowerAsset{readonly mode:SourceScalarPowerMode;readonly sha256:string;readonly url:string;readonly bytes:65536}
/** ROOT canonical Decimal70/100 artifact identities; finite functional law, not nativeISA pixels. */
export const SOURCE_SCALAR_POWER_ASSETS:Readonly<Record<SourceScalarPowerMode,SourceScalarPowerAsset>>=Object.freeze({
  "easyDodge": {
    "mode": "easyDodge",
    "sha256": "a5710bff7d876933e8bbb9900dad2c605ff1a8d2dcf03594731a83c61cec9a6e",
    "url": "/brush-math/easyDodge-a5710bff7d876933e8bbb9900dad2c605ff1a8d2dcf03594731a83c61cec9a6e.rgba",
    "bytes": 65536
  },
  "easyBurn": {
    "mode": "easyBurn",
    "sha256": "5c1319035053f4e78154f5e37ef1a4e10922d6fcf8faae66f4c4d069d757a226",
    "url": "/brush-math/easyBurn-5c1319035053f4e78154f5e37ef1a4e10922d6fcf8faae66f4c4d069d757a226.rgba",
    "bytes": 65536
  },
  "pNormA": {
    "mode": "pNormA",
    "sha256": "531d7a917fa9174e0e0b371aaebc598a826c5bf8f38c0aabde21ebc157e263ea",
    "url": "/brush-math/pNormA-531d7a917fa9174e0e0b371aaebc598a826c5bf8f38c0aabde21ebc157e263ea.rgba",
    "bytes": 65536
  },
  "superLight": {
    "mode": "superLight",
    "sha256": "beaa800237a6e7ff10f865d69227a5d9facbf54cb72d05576a855a36bfb60c31",
    "url": "/brush-math/superLight-beaa800237a6e7ff10f865d69227a5d9facbf54cb72d05576a855a36bfb60c31.rgba",
    "bytes": 65536
  },
  "softLightIfs": {
    "mode": "softLightIfs",
    "sha256": "569fd96d292fd3640c948903d315c63ca623ecbe6dc71da9ab73d0b570a8d11a",
    "url": "/brush-math/softLightIfs-569fd96d292fd3640c948903d315c63ca623ecbe6dc71da9ab73d0b570a8d11a.rgba",
    "bytes": 65536
  }
})

for(const entry of Object.values(SOURCE_SCALAR_POWER_ASSETS))Object.freeze(entry)
