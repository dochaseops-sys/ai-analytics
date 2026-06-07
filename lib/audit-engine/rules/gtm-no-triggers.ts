import { AuditRule, AuditResult } from '../types';

export const gtmNoTriggersRule: AuditRule = {
  id: 'gtm-no-triggers',
  name: 'GTM Tags Without Triggers',
  category: 'GTM Setup',
  severity: 'medium',
  async run(context): Promise<AuditResult> {
    if (!context.gtmContainerId || !context.gtmData) {
      return {
        issueId: this.id,
        severity: this.severity,
        title: this.name,
        description: 'GTM container is not connected. Cannot audit tag triggers.',
        recommendation: 'Connect a GTM container first to run tag trigger audits.',
        category: this.category,
        passed: false
      };
    }

    const tags = context.gtmData.tags || [];
    const untriggeredTags = tags.filter(tag => {
      // Standard GTM tags need firing triggers. Note: some tags like Consent initialization or default tags might have default setups.
      // But typically, a tag has a firingTriggerId array.
      const hasFiring = tag.firingTriggerId && tag.firingTriggerId.length > 0;
      // Exclude special GTM folder settings, templates, or setup/teardown tags if any, but in the tag object returned by API:
      // tag.firingTriggerId contains the triggers.
      return !hasFiring;
    });

    const passed = untriggeredTags.length === 0;
    const tagNames = untriggeredTags.map(t => t.name).join(', ');

    return {
      issueId: this.id,
      severity: this.severity,
      title: this.name,
      description: passed
        ? 'All GTM tags have at least one firing trigger configured.'
        : `Detected ${untriggeredTags.length} GTM tag(s) with no firing triggers: ${tagNames}. These tags will never execute on the site.`,
      recommendation: passed
        ? 'Verify that your triggers fire on correct actions and page conditions.'
        : 'Go to Google Tag Manager and assign a trigger (e.g. All Pages, custom click event) to the reported tags, or delete them if obsolete.',
      category: this.category,
      passed
    };
  }
};
