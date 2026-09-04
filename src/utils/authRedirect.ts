/**
 * URL usada em e-mails de auth (recuperação de senha, convite).
 * Prefira VITE_APP_URL (domínio estável de produção) para não gerar
 * links para preview deployments da Vercel que depois somem (404 DEPLOYMENT_NOT_FOUND).
 */
export function getAuthRedirectUrl(): string {
  const configured = String(import.meta.env.VITE_APP_URL ?? '').trim()
  if (configured) {
    const withProtocol = /^https?:\/\//i.test(configured)
      ? configured
      : `https://${configured}`
    return withProtocol.replace(/\/+$/, '') + '/'
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/`
  }

  return 'https://timeb2c.vercel.app/'
}
