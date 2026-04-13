import { describe, it, expect } from 'vitest'
import { buildAliasTable } from '../aliases.js'
import type { ChunkAnalysis } from '../../analyser/types.js'

function makeChunk(name: string, file: string, deps: string[] = []): ChunkAnalysis {
  return {
    name, file, summary: '', owns: [], doesNotOwn: [],
    dependencies: deps.map((d) => ({ name: d, type: 'internal', why: '', risk: 'low' })),
    usedBy: [], publicInterface: [], failurePoints: [], implicitAssumptions: [],
    envVars: [], domainLanguage: [], riskLevel: 'low', riskReason: '',
    beforeYouTouch: [], missingThings: [], todos: [],
  }
}

describe('buildAliasTable', () => {
  it('creates one entry per chunk', () => {
    const chunks = [makeChunk('Payment Service', 'src/payment.ts'), makeChunk('Auth Service', 'src/auth.ts')]
    const table = buildAliasTable(chunks)
    expect(table).toHaveLength(2)
  })

  it('detects aliases via normalised name matching', () => {
    // chunk named "Payment Service", referenced elsewhere as "PaymentService" and "payment-svc"
    const payment = makeChunk('Payment Service', 'src/payment.ts')
    const booking = makeChunk('Booking Service', 'src/booking.ts', ['PaymentService', 'payment-svc'])

    const table = buildAliasTable([payment, booking])
    const paymentEntry = table.find((e) => e.canonical === 'Payment Service')!

    expect(paymentEntry.aliases).toContain('PaymentService')
    expect(paymentEntry.aliases).toContain('payment-svc')
  })

  it('counts dependents correctly', () => {
    const payment = makeChunk('Payment Service', 'src/payment.ts')
    const booking = makeChunk('Booking Service', 'src/booking.ts', ['Payment Service'])
    const admin = makeChunk('Admin Service', 'src/admin.ts', ['Payment Service'])
    const util = makeChunk('Util', 'src/util.ts')

    const table = buildAliasTable([payment, booking, admin, util])
    const paymentEntry = table.find((e) => e.canonical === 'Payment Service')!

    expect(paymentEntry.dependents).toBe(2)
  })

  it('classifies services by dependent count', () => {
    const core = makeChunk('Core', 'src/core.ts')
    const consumers = Array.from({ length: 5 }, (_, i) =>
      makeChunk(`Consumer${i}`, `src/c${i}.ts`, ['Core'])
    )
    const table = buildAliasTable([core, ...consumers])
    const coreEntry = table.find((e) => e.canonical === 'Core')!
    expect(coreEntry.classification).toBe('core')
  })

  it('classifies a service with no dependents as unknown', () => {
    const chunks = [makeChunk('Isolated', 'src/isolated.ts')]
    const table = buildAliasTable(chunks)
    expect(table[0].classification).toBe('unknown')
  })

  it('does not add the canonical name itself as an alias', () => {
    const payment = makeChunk('Payment Service', 'src/payment.ts')
    const booking = makeChunk('Booking', 'src/booking.ts', ['Payment Service'])
    const table = buildAliasTable([payment, booking])
    const entry = table.find((e) => e.canonical === 'Payment Service')!
    expect(entry.aliases).not.toContain('Payment Service')
  })

  it('returns empty table for empty input', () => {
    expect(buildAliasTable([])).toHaveLength(0)
  })

  it('handles names that differ only in common suffixes', () => {
    // "Auth" and "AuthService" and "auth-svc" should all normalise together
    const auth = makeChunk('Auth', 'src/auth.ts')
    const consumer = makeChunk('API', 'src/api.ts', ['AuthService'])
    const table = buildAliasTable([auth, consumer])
    const authEntry = table.find((e) => e.canonical === 'Auth')!
    expect(authEntry.aliases).toContain('AuthService')
  })
})
