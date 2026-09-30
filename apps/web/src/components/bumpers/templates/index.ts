import type { BumperKind } from '@zemi/shared';
import type { TemplateDefinition } from '../engine/types';
import standby from './pre-show/standby';
import countdown from './pre-show/countdown';
import houseRules from './pre-show/house-rules';
import wifi from './pre-show/wifi';
import sponsors from './pre-show/sponsors';
import welcome from './opening/welcome';
import eventTitle from './opening/event-title';
import agenda from './opening/agenda';
import upNext from './opening/up-next';
import mc from './opening/mc';
import opening from './opening/opening';
import ceremony from './opening/ceremony';
import keynote from './talks/keynote';
import speaker from './talks/speaker';
import paper from './talks/paper';
import talkTitle from './talks/talk-title';
import panel from './talks/panel';
import lineup from './talks/lineup';
import thanksSpeaker from './talks/thanks-speaker';
import quote from './talks/quote';
import qna from './interaction/qna';
import featuredQuestion from './interaction/featured-question';
import prompt from './interaction/prompt';
import feedback from './interaction/feedback';
import register from './interaction/register';
import breakTemplate from './breaks/break';
import brb from './breaks/brb';
import photo from './breaks/photo';
import awards from './closing/awards';
import credits from './closing/credits';
import nextEvent from './closing/next-event';
import closing from './closing/closing';
import socials from './closing/socials';
import section from './utility/section';
import announcement from './utility/announcement';
import image from './utility/image';
import lowerThird from './utility/lower-third';
import custom from './utility/custom';
import blank from './utility/blank';

/** Every bumper template, by kind. Each lives in its own file under templates/<category>/. */
export const TEMPLATES: Record<BumperKind, TemplateDefinition> = {
  'standby': standby,
  'countdown': countdown,
  'house-rules': houseRules,
  'wifi': wifi,
  'sponsors': sponsors,
  'welcome': welcome,
  'event-title': eventTitle,
  'agenda': agenda,
  'up-next': upNext,
  'mc': mc,
  'opening': opening,
  'ceremony': ceremony,
  'keynote': keynote,
  'speaker': speaker,
  'paper': paper,
  'talk-title': talkTitle,
  'panel': panel,
  'lineup': lineup,
  'thanks-speaker': thanksSpeaker,
  'quote': quote,
  'qna': qna,
  'featured-question': featuredQuestion,
  'prompt': prompt,
  'feedback': feedback,
  'register': register,
  'break': breakTemplate,
  'brb': brb,
  'photo': photo,
  'awards': awards,
  'credits': credits,
  'next-event': nextEvent,
  'closing': closing,
  'socials': socials,
  'section': section,
  'announcement': announcement,
  'image': image,
  'lower-third': lowerThird,
  'custom': custom,
  'blank': blank,
};

export function getTemplate(kind: BumperKind): TemplateDefinition {
  return TEMPLATES[kind] ?? TEMPLATES.custom;
}
