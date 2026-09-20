import React from 'react';
import dayjs from 'dayjs';
import numeral from 'numeral';
import {
  Clock,
  Eye,
  Heart,
  MessageCircle,
  Repeat,
} from 'lucide-react';
import { useI18n } from '~contents/hooks/i18n';
import { navigateInX } from '~contents/utils/navigateInX';

type ReplyAlphaTweetItem = {
  id?: string;
  rank?: number;
  burst_label?: string;
  burst_probability?: number;
  burst_speed?: number;
  competition_score?: number;
  reply_count?: number;
  tweet?: {
    id?: string;
    link?: string;
    text?: string;
    create_time?: string;
    profile?: {
      name?: string;
      username?: string;
      username_raw?: string;
      profile_image_url?: string;
      is_blue_verified?: boolean;
    };
    statistic?: {
      likes?: number;
      reply_count?: number;
      retweet_count?: number;
      views?: number;
    };
    ai?: {
      title_cn?: string | null;
      title_en?: string | null;
      summary_cn?: string | null;
      summary_en?: string | null;
      abstract_cn?: string | null;
      abstract_en?: string | null;
    };
  };
};

const formatNumber = (num: number | undefined) => {
  if (num === undefined || num === null) return '0';
  return numeral(num || 0)
    .format('0.[0]a')
    .toUpperCase();
};

const formatDate = (dateString: string | undefined) => {
  if (!dateString) return '';
  const date = dayjs(dateString);
  const now = dayjs();
  const hoursAgo = now.diff(date, 'hour');

  if (hoursAgo < 24) {
    return date.format('h:mm A');
  }

  return date.format('MMM D');
};

const formatScore = (num: number | undefined) => {
  if (num === undefined || num === null) return '0';
  return numeral(num || 0).format('0.[0]');
};

const formatSpeed = (num: number | undefined) => {
  if (num === undefined || num === null) return '';
  return `+ ${numeral(num || 0)
    .format('0.[0]a')
    .toUpperCase()}/H`;
};

const getBurstSpeedClassName = () =>
  'inline-flex items-center text-[10px] font-semibold leading-none text-emerald-500';

function VerifiedBadge() {
  return (
    <svg
      className='w-3 h-3 text-[#1d9bf0] flex-shrink-0'
      viewBox='0 0 22 22'
      fill='currentColor'
    >
      <path d='M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z'></path>
    </svg>
  );
}

export function ReplyAlphaTweetList(props: {
  items: ReplyAlphaTweetItem[];
  lang: 'zh' | 'en';
}) {
  const { t } = useI18n();
  const { items, lang } = props;
  if (!items.length) {
    return (
      <div className='mt-3 flex items-center justify-center h-[260px] theme-text-secondary'>
        <div className='text-center'>
          <div className='text-sm'>{t('noData')}</div>
          <div className='text-xs mt-1'>{t('tryDifferentPeriod')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className='mt-3 space-y-2'>
      {items.map((it, idx) => {
        const tw = it?.tweet;
        const profile = tw?.profile;
        const ai = tw?.ai;
        const username = profile?.username_raw || profile?.username || 'unknown';
        const tweetId = tw?.id || it?.id || 'unknown';
        const rank = it?.rank ?? idx + 1;
        const burstSpeed = formatSpeed(it?.burst_speed);
        const burstSpeedClassName = getBurstSpeedClassName();
        const title =
          lang === 'zh'
            ? ai?.title_cn ||
              ai?.summary_cn ||
              ai?.abstract_cn ||
              ai?.title_en ||
              ai?.summary_en ||
              ai?.abstract_en ||
              tw?.text ||
              ''
            : ai?.title_en ||
              ai?.summary_en ||
              ai?.abstract_en ||
              ai?.title_cn ||
              ai?.summary_cn ||
              ai?.abstract_cn ||
              tw?.text ||
              '';

        const handleClick = () => {
          navigateInX(tw?.link || `https://x.com/${username}/status/${tweetId}`);
        };

        return (
          <div
            key={`${tweetId}-${idx}`}
            className='group px-3 py-2 rounded-lg border theme-border hover:bg-white/5 cursor-pointer transition-colors'
            onClick={handleClick}
          >
            <div className='flex items-start gap-2'>
              <div className='flex-shrink-0 flex justify-center pt-0.5 w-7'>
                <span
                  className={`min-w-[20px] px-1.5 h-5 flex items-center justify-center text-[11px] font-semibold rounded-full ${idx === 0
                    ? 'bg-[#e3c102]/90 text-white'
                    : idx === 1
                      ? 'bg-[#C0C0C0]/90 text-white'
                      : idx === 2
                        ? 'bg-[#CD7F32]/90 text-white'
                        : 'bg-black/5 theme-text-secondary'
                    }`}
                >
                  {rank}
                </span>
              </div>

              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2 mb-1'>
                  <img
                    src={profile?.profile_image_url}
                    alt={profile?.name || username}
                    className='w-7 h-7 rounded-full object-cover flex-shrink-0'
                    loading='lazy'
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png';
                    }}
                  />
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center justify-between gap-2'>
                      <div className='flex items-center gap-1.5 min-w-0'>
                        <button
                          type='button'
                          className='text-xs font-semibold theme-text-primary truncate hover:underline text-left'
                          title={profile?.name || username}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigateInX(`https://x.com/${username}`);
                          }}
                        >
                          {profile?.name || username}
                        </button>
                        {profile?.is_blue_verified && <VerifiedBadge />}
                      </div>
                      <span className='text-[10px] theme-text-secondary flex-shrink-0'>
                        {formatDate(tw?.create_time)}
                      </span>
                    </div>
                    <div className='flex items-center gap-1 text-[11px] theme-text-secondary'>
                      <span className='truncate'>@{profile?.username || username}</span>
                    </div>
                  </div>
                </div>

                <div className='text-[12px] leading-snug theme-text-secondary break-words line-clamp-2'>
                  {title || t('replyAlphaNoContent')}
                </div>

                <div className='mt-2 flex items-center justify-between gap-2 text-[10px] theme-text-secondary'>
                  {burstSpeed && (
                    <span className={`${burstSpeedClassName} shrink-0`}>
                      {burstSpeed}
                    </span>
                  )}
                  <span className='ml-auto flex items-center gap-2 flex-shrink-0'>
                    <span className='inline-flex items-center gap-0.5'>
                      <MessageCircle className='w-3 h-3' />
                      {formatNumber(it?.reply_count ?? tw?.statistic?.reply_count)}
                    </span>
                    <span className='inline-flex items-center gap-0.5'>
                      <Eye className='w-3 h-3' />
                      {formatNumber(tw?.statistic?.views)}
                    </span>
                    <span className='inline-flex items-center gap-0.5'>
                      <Heart className='w-3 h-3' />
                      {formatNumber(tw?.statistic?.likes)}
                    </span>
                    <span className='inline-flex items-center gap-0.5'>
                      <Repeat className='w-3 h-3' />
                      {formatNumber(tw?.statistic?.retweet_count)}
                    </span>
                  </span>
                </div>

                {/*{typeof it?.competition_score === 'number' && (*/}
                {/*  <div className='mt-1.5 flex items-center gap-1 text-[10px] theme-text-secondary'>*/}
                {/*    <Clock className='w-3 h-3' />*/}
                {/*    <span>*/}
                {/*      {t('replyAlphaCompetition')} {formatScore(it.competition_score)}*/}
                {/*    </span>*/}
                {/*  </div>*/}
                {/*)}*/}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
