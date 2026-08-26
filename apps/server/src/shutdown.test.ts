import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Server } from 'socket.io'
import { io as connect, type Socket as ClientSocket } from 'socket.io-client'
import { afterEach, describe, expect, it } from 'vitest'

import { disconnectAllClients } from './shutdown.js'

// (#504) Единственный тест в этом пакете, который поднимает настоящую пару
// socket.io сервер + socket.io-client, и по делу: проверяемое утверждение
// целиком живёт в протоколе между ними. Мок сокета здесь доказывал бы, что мы
// зовём то, что решили звать, — а сломано было именно то, как настоящий клиент
// читает то, что мы звали. Postgres не нужен: модуль знает только про socket.io.
describe('disconnectAllClients (#504)', () => {
  let http: HttpServer | null = null
  let io: Server | null = null
  let client: ClientSocket | null = null

  afterEach(async () => {
    client?.close()
    io?.close()
    await new Promise<void>(resolve => {
      if (http) http.close(() => resolve())
      else resolve()
    })
    http = null; io = null; client = null
  })

  const boot = async (): Promise<number> => {
    http = createServer()
    io = new Server(http)
    await new Promise<void>(resolve => http!.listen(0, resolve))
    return (http.address() as AddressInfo).port
  }

  it('роняет соединение так, что клиент возвращается сам', async () => {
    const port = await boot()
    client = connect(`http://localhost:${port}`, { reconnectionDelay: 50 })

    const connects: number[] = []
    const secondConnect = new Promise<void>(resolve => {
      client!.on('connect', () => {
        connects.push(connects.length + 1)
        if (connects.length === 1) disconnectAllClients(io!)
        else resolve()
      })
    })

    // Ждать приходится именно второго `connect`, а не отсутствия чего-либо:
    // «клиент не сдался» — это наблюдаемое возвращение, и только оно отличает
    // починку от прежнего поведения, где сокет молча оставался мёртвым.
    await secondConnect
    expect(connects.length).toBe(2)
    expect(client.active).toBe(true)
  }, 10_000)

  it('клиент читает это как обрыв, а не как решение сервера', async () => {
    const port = await boot()
    client = connect(`http://localhost:${port}`, { reconnectionDelay: 50 })

    const reason = await new Promise<string>(resolve => {
      client!.on('connect', () => disconnectAllClients(io!))
      client!.on('disconnect', r => resolve(r))
    })

    // Причина здесь — не деталь реализации, а вся суть бага: `io server
    // disconnect` — единственный reason, после которого socket.io-client не
    // делает ни одной попытки переподключения, и открытая комната остаётся
    // мёртвой до перезагрузки страницы. Какой именно обрыв увидит клиент
    // (`transport close` или `transport error`), зависит от того, успел ли он
    // уйти с polling на websocket, и значения не имеет: и то и другое он
    // считает обрывом и продолжает пытаться — что и сказано вторым ожиданием.
    expect(reason).not.toBe('io server disconnect')
    expect(client!.active).toBe(true)
  }, 10_000)
})
