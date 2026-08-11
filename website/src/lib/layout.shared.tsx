import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { i18n } from './i18n';
import { t } from './landing-i18n';

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
      title: 'Prime Agent Session Manager',
    },
    links: [
      { text: nav.philosophy, url: `${prefix}/#philosophy` },
      { text: nav.capabilities, url: `${prefix}/#capabilities` },
      { text: nav.sources, url: `${prefix}/#sources` },
      { text: nav.docs, url: `${prefix}/docs` },
      { text: nav.download, url: `${prefix}/#download` },
      {
        text: nav.demo,
        url: 'https://sessions.178.104.6.186.sslip.io/#/projects',
        external: true,
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
