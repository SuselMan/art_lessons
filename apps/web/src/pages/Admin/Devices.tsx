import type { AdminDevice, AdminUserIp, ClientEnvironment } from '@grafetto/shared'

import { ago, date } from './format'
import styles from './Admin.module.css'

function yesNo(value: boolean | undefined): string {
  return value === undefined ? '—' : value ? 'yes' : 'no'
}

/** The questions a bug report starts with, answered from what the device
 *  reported: which build, which layout, which input, which GPU. */
function envFacts(env: ClientEnvironment): Array<[string, string]> {
  const size = (w?: number, h?: number) => (w && h ? `${w}×${h}` : '—')
  return [
    ['Build', env.appVersion ?? '—'],
    ['Layout', env.deviceType ? `${env.deviceType}${env.deviceTypeChosen ? ' (chosen)' : ' (detected)'}` : '—'],
    ['Screen', `${size(env.screenW, env.screenH)}${env.dpr ? ` @${env.dpr}x` : ''}`],
    ['Window', size(env.viewportW, env.viewportH)],
    ['Input', `pointer ${env.pointer ?? '—'} · touch points ${env.maxTouchPoints ?? '—'} · hover ${yesNo(env.hover)}`],
    ['Pen with pressure', yesNo(env.penSeen)],
    ['GPU', env.webgl === false ? 'no WebGL' : [env.gpuVendor, env.gpuRenderer].filter(Boolean).join(' · ') || '—'],
    ['Max texture', env.maxTextureSize ? String(env.maxTextureSize) : '—'],
    ['Installed app', yesNo(env.standalone)],
    ['Language / zone', `${env.language ?? '—'} · ${env.timeZone ?? '—'}`],
    ['Memory / cores', `${env.deviceMemoryGb ? `${env.deviceMemoryGb} GB` : '—'} · ${env.cores ?? '—'}`],
  ]
}

/** Safari on iPadOS says it is a Mac by default (clientDescription.ts on the
 *  server); a Mac has no touch points, so the reported environment settles
 *  what the user agent alone cannot. */
function platformLabel(device: AdminDevice): string {
  if (device.platform !== 'apple-desktop-ua') return device.platform
  const touch = device.env?.maxTouchPoints
  if (touch === undefined) return 'iPad or Mac'
  return touch > 1 ? 'iPad (desktop UA)' : 'macOS'
}

export function DeviceList({ devices, onOpenIp }: { devices: AdminDevice[]; onOpenIp: (ip: string) => void }) {
  if (devices.length === 0) return <p className={styles.empty}>No devices recorded yet.</p>
  return (
    <div className={styles.devices}>
      {devices.map(device => (
        <div key={device.deviceId} className={styles.device}>
          <div className={styles.deviceHead}>
            <strong>{device.browser}</strong> on <strong>{platformLabel(device)}</strong>
            {device.env?.deviceType && <span className={styles.badge}>{device.env.deviceType}</span>}
            {device.env?.penSeen && <span className={styles.badge}>pen</span>}
            <span className={styles.hint}>last {ago(device.lastSeenAt)} · first {date(device.firstSeenAt)}</span>
          </div>
          <dl className={styles.facts}>
            <dt>Last IP</dt>
            <dd>
              {device.lastIp
                ? <button type="button" className={styles.link} onClick={() => onOpenIp(device.lastIp!)}>{device.lastIp}</button>
                : '—'}
            </dd>
            {device.env
              ? envFacts(device.env).map(([label, value]) => (
                <div key={label} className={styles.factRow}><dt>{label}</dt><dd>{value}</dd></div>
              ))
              : <><dt>Environment</dt><dd className={styles.dim}>not reported (older build or no page load since)</dd></>}
            <dt>User agent</dt><dd className={styles.mono}>{device.userAgent || '—'}</dd>
          </dl>
          {device.envAt && <div className={styles.hint}>Environment reported {ago(device.envAt)}</div>}
        </div>
      ))}
    </div>
  )
}

export function IpList({ ips, onOpenIp }: { ips: AdminUserIp[]; onOpenIp: (ip: string) => void }) {
  if (ips.length === 0) return <p className={styles.empty}>None recorded.</p>
  return (
    <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th>Address</th><th>First seen</th><th>Last seen</th><th /></tr></thead>
      <tbody>
        {ips.map(ip => (
          <tr key={ip.ip}>
            <td><button type="button" className={styles.link} onClick={() => onOpenIp(ip.ip)}>{ip.ip}</button></td>
            <td>{date(ip.firstSeenAt)}</td>
            <td>{ago(ip.lastSeenAt)}</td>
            <td>{ip.banned && <span className={styles.badgeBanned}>banned</span>}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  )
}
