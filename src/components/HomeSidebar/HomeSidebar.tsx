import { Component, createEffect, createSignal, For, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import { APP_ID } from '../../App';
import { getMostZapped4h, getTrending24h } from '../../lib/feed';
import { humanizeNumber } from '../../lib/stats';
import { convertToNotes, sortingPlan } from '../../stores/note';
import { Kind } from '../../constants';
import {
  isConnected,
  refreshSocketListeners,
  removeSocketListeners,
  socket
} from '../../sockets';
import {
  FeedPage,
  NostrEOSE,
  NostrEvent,
  NostrEventContent,
  NostrMentionContent,
  PrimalNote
} from '../../types/primal';

import styles from './HomeSidebar.module.scss';
import SmallNote from '../SmallNote/SmallNote';
import { useIntl } from '@cookbook/solid-intl';
import { hourNarrow } from '../../formats';

import { home as t } from '../../translations';
import { useAccountContext } from '../../contexts/AccountContext';

const [init, setInit] = createSignal(false);

const [data, setData] = createStore<Record<string, FeedPage & { notes: PrimalNote[] }>>({
  trending: {
    messages: [],
    users: {},
    postStats: {},
    notes: [],
    mentions: {},
  },
  mostzapped: {
    messages: [],
    users: {},
    postStats: {},
    notes: [],
    mentions: {},
  },
});

const HomeSidebar: Component = () => {

  const intl = useIntl();
  const account = useAccountContext();

  onCleanup(() => {
    removeSocketListeners(
      socket(),
      { message: onMessage, close: onSocketClose },
    );
  });


	createEffect(() => {
    if (isConnected() && !init()) {
      refreshSocketListeners(
        socket(),
        { message: onMessage, close: onSocketClose },
      );

      setData(() => ({
        trending: {
          messages: [],
          users: {},
          postStats: {},
          notes: [],
          mentions: {},
        },
        mostzapped: {
          messages: [],
          users: {},
          postStats: {},
          notes: [],
          mentions: {},
        },
      }));

      if (account?.isKeyLookupDone) {
        getTrending24h(account?.publicKey, `sidebar_trending_${APP_ID}`);
        getMostZapped4h(account?.publicKey, `sidebar_zapped_${APP_ID}`);
      }
		}
	});

  const processNotes = (type: string, key: string, content: NostrEventContent | undefined) => {

    const sort = sortingPlan(key);

    if (type === 'EOSE') {
      const newPosts = sort(convertToNotes({
        users: data[key].users,
        messages: data[key].messages,
        postStats: data[key].postStats,
        mentions: data[key].mentions,
      }));

      setData(key, 'notes', () => [ ...newPosts ]);

      setInit(true);
      return;
    }

    if (type === 'EVENT') {
      if (content && content.kind === Kind.Metadata) {
        setData(key, 'users', (users) => ({ ...users, [content.pubkey]: content}))
      }
      if (content && (content.kind === Kind.Text || content.kind === Kind.Repost)) {
        setData(key, 'messages',  (msgs) => [ ...msgs, content]);
      }
      if (content && content.kind === Kind.NoteStats) {
        const stat = JSON.parse(content.content);
        setData(key, 'postStats', (stats) => ({ ...stats, [stat.event_id]: stat }))
      }
      if (content && content.kind === Kind.Mentions) {
        const mentionContent = content as NostrMentionContent;
        const mention = JSON.parse(mentionContent.content);

        setData(key, 'mentions',
          (mentions) => ({ ...mentions, [mention.id]: { ...mention } })
        );
        return;
      }
    }
  };

// SOCKET HANDLERS ------------------------------

  const onSocketClose = (closeEvent: CloseEvent) => {
    const webSocket = closeEvent.target as WebSocket;

    webSocket.removeEventListener('message', onMessage);
    webSocket.removeEventListener('close', onSocketClose);
  };

  const onMessage = (event: MessageEvent) => {
    const message: NostrEvent | NostrEOSE = JSON.parse(event.data);

    const [type, subId, content] = message;

    if (subId === `sidebar_trending_${APP_ID}`) {
      processNotes(type, 'trending', content);
      return;
    }
    if (subId === `sidebar_zapped_${APP_ID}`) {
      processNotes(type, 'mostzapped', content);
      return;
    }
  };

  return (
    <div>
      <div class={styles.headingTrending}>
        <div>
          <div class={styles.flameIcon}></div>
          {intl.formatMessage(t.trending)}
          <span>
            {intl.formatNumber(24, hourNarrow)}
          </span>
        </div>
      </div>

      <For each={data.trending.notes}>
        {(note) => <SmallNote note={note} />}
      </For>

      <div class={styles.headingZapped}>
        <div>
          <div class={styles.zapIcon}></div>
          {intl.formatMessage(t.mostZapped)}
          <span>
            {intl.formatNumber(4, hourNarrow)}
          </span>
        </div>
      </div>
      <For each={data.mostzapped.notes}>
        {
          (note) =>
            <SmallNote
              note={note}
            >
            {intl.formatMessage(t.zapPostfix,
            {
              zaps: humanizeNumber(note.post.zaps, true),
              sats: humanizeNumber(note.post.satszapped, true),
            })}
            </SmallNote>
        }
      </For>
    </div>
  );
}

export default HomeSidebar;
