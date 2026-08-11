import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { i18n } from './i18n';
import { t } from './landing-i18n';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const gitConfig = {
  user: 'dat-lequoc',
  repo: 'prime-agent-session-manager',
  branch: 'main',
};

export function baseOptions(lang?: string): BaseLayoutProps {
  const prefix = lang ? `/${lang}` : '';
  const nav = t(lang ?? 'en').nav;

  return {
    i18n,
    nav: {
      title: (
        <span className="inline-flex items-center gap-2">
          <img
            src={`${basePath}/prime-agent-icon.png`}
            alt=""
            width={28}
            height={28}
            className="rounded-md"
            aria-hidden="true"
          />
          <span>Prime Agent Session Manager</span>
        </span>
      ),
    },
    links: [
      { text: nav.philosophy, url: `${prefix}/#philosophy` },
      { text: nav.capabilities, url: `${prefix}/#capabilities` },
      { text: nav.sources, url: `${prefix}/#sources` },
      { text: nav.docs, url: `${prefix}/docs` },
      { text: nav.download, url: `${prefix}/#download` },
      {
        text: nav.demo,
        url: '/demo/',
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
