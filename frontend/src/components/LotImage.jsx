// Imagem da obra com fallback elegante (sem imagem ou se o link falhar).
// A API devolve as imagens da AIC como caminho do proxy ("/images/aic/<id>"),
// porque o servidor de imagens da AIC bloqueia acesso direto do navegador.
import { useState } from 'react';
import { apiUrl } from '../api/client';
import { Icon } from './Icon';

// eager: imagem principal da página (sala, comprovante) carrega na hora; nas listas, sob demanda.
export function LotImage({ src, alt, className = '', eager = false }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`lot-image lot-image--empty ${className}`} role="img" aria-label={alt}>
        <Icon name="image" size={32} />
        <span>Imagem indisponível</span>
      </div>
    );
  }
  const resolved = src.startsWith('/') ? apiUrl(src) : src;
  return (
    <img className={`lot-image ${className}`} src={resolved} alt={alt} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)} />
  );
}
