// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn(), recover: vi.fn(), auth: { isLoading: false, isAuthenticated: false } }))
vi.mock('convex/react', () => ({ useConvexAuth: () => mocks.auth, useMutation: () => vi.fn(), useQuery: () => [] }))
vi.mock('@convex-dev/auth/react', () => ({ useAuthActions: () => ({ signOut: vi.fn() }) }))
vi.mock('@convex-dev/auth/methods/email-password/react', () => ({
  useSignInWithEmailPassword: () => ({ signIn: mocks.signIn, pending: false }),
  useSignUpWithEmailPassword: () => ({ signUp: mocks.signUp, pending: false }),
  useStartPasswordRecovery: () => ({ startPasswordRecovery: mocks.recover, pending: false }),
  useCompleteSignUpWithEmailPassword: () => ({ status: 'error' }),
  useCompletePasswordRecovery: () => ({ status: 'error' }),
}))
import { Account } from '../src/account.tsx'
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.auth.isLoading = false; mocks.auth.isAuthenticated = false })
describe('account UI boundary', () => {
  it('restores session without showing credentials', () => { mocks.auth.isLoading = true; render(<Account/>); expect(screen.getByRole('status').textContent).toContain('Restoring'); expect(screen.queryByLabelText('Password')).toBeNull() })
  it('submits credentials and clears password on error', async () => { mocks.signIn.mockResolvedValue({ status: 'error' }); render(<Account/>); fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } }); fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'example-only' } }); fireEvent.submit(screen.getByLabelText('Password').closest('form')!); await waitFor(() => { expect(screen.getByRole('status').textContent).toContain('Sign in failed') }); expect(mocks.signIn).toHaveBeenCalledWith({ email: 'test@example.com', password: 'example-only' }); expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('') })
  it('does not unlock shared Host after authentication', () => { mocks.auth.isAuthenticated = true; render(<Account/>); expect(screen.getByText(/does not unlock a shared Host/)).toBeTruthy(); expect(screen.queryByText('Open workspace')).toBeNull() })
  it('removes password field in recovery mode', () => { render(<Account/>); fireEvent.click(screen.getByRole('button', { name: 'Forgot password' })); expect(screen.queryByLabelText('Password')).toBeNull(); expect(screen.getByRole('button', { name: 'Send recovery link' })).toBeTruthy() })
})
