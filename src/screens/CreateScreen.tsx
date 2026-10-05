import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../AppContext';
import { ApiError, fetchProductInfo, generate } from '../api';
import { THREADS_MAX_CHARS } from '../config';
import { charCount, checkExpressions, hasDisclosure, isHttpUrl, looksLikeAffiliate, withDisclosure } from '../compliance';
import { BUILT_IN_TEMPLATES, loadCustomTemplates, loadProductDraft, saveProductDraft, upsertHistory } from '../storage';
import { openThreads } from '../threads';
import { Draft, Pattern, ProductForm, Template, emptyProduct } from '../types';
import { Button, Card, Chip, Field, Icon, IconName, Label, Pill, Section, Text, colors, styles } from '../ui';
import ScheduleBox from './ScheduleBox';
import RewardedButton from '../RewardedButton';
import { AdSlot } from '../ads';

const TONES = [
  { label: 'カジュアル', emoji: '😊' },
  { label: '丁寧', emoji: '🙇' },
  { label: '熱量高め', emoji: '🔥' },
  { label: '落ち着いた', emoji: '🍵' },
];
const K_WELCOME = 'welcome_hidden_v1';
const K_RESULT = 'last_result_v1';

interface Editor extends Draft {
  /** 履歴に保存済みならその ID */
  historyId: string | null;
  favorite: boolean;
  posted: boolean;
}

export default function CreateScreen() {
  const { refreshCredits, tab, settings, updateSettings, credits, setBalance, setTab, toast, reopen, openInEditor } = useApp();
  const [product, setProduct] = useState<ProductForm>(emptyProduct);
  const [image, setImage] = useState('');
  const [templates, setTemplates] = useState<Template[]>(BUILT_IN_TEMPLATES);
  const [fetching, setFetching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [welcomeHidden, setWelcomeHidden] = useState(true);
  const scroll = useRef<ScrollView>(null);
  const resultsY = useRef(0);
  const editorY = useRef(0);

  const hideWelcome = () => {
    setWelcomeHidden(true);
    AsyncStorage.setItem(K_WELCOME, '1');
  };

  useEffect(() => {
    AsyncStorage.getItem(K_WELCOME).then((v) => setWelcomeHidden(v === '1'));
    loadProductDraft().then((p) => {
      setProduct(p);
      // 前回の入力に特徴・届けたい人があれば、くわしい設定を開いておく
      if (p.description || p.target) setShowMore(true);
    });
    loadCustomTemplates().then((c) => setTemplates([...BUILT_IN_TEMPLATES, ...c]));
    // Threads アプリに切り替えている間にページが閉じられても、直前の結果を復元する
    AsyncStorage.getItem(K_RESULT).then((raw) => {
      if (!raw) return;
      try {
        const r = JSON.parse(raw);
        setPatterns(r.patterns ?? []);
        setSelected(r.selected ?? null);
        setEditor(r.editor ?? null);
      } catch {}
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(K_RESULT, JSON.stringify({ patterns, selected, editor }));
  }, [patterns, selected, editor]);

  // テンプレート画面で追加・編集されたものを反映する
  useEffect(() => {
    if (tab === 'create') loadCustomTemplates().then((c) => setTemplates([...BUILT_IN_TEMPLATES, ...c]));
  }, [tab]);

  // 履歴から開いた投稿を編集欄に読み込む
  useEffect(() => {
    if (!reopen) return;
    setPatterns([]);
    setSelected(null);
    setEditor({ ...reopen, historyId: reopen.id });
    openInEditor(null);
    setTimeout(() => scroll.current?.scrollTo({ y: editorY.current - 12, animated: true }), 100);
  }, [reopen, openInEditor]);

  const update = (patch: Partial<ProductForm>) =>
    setProduct((p) => {
      const next = { ...p, ...patch };
      saveProductDraft(next);
      return next;
    });

  const template = templates.find((t) => t.id === settings.templateId) ?? templates[0];

  const readProduct = async () => {
    const url = product.url.trim();
    if (!isHttpUrl(url)) return toast('商品ページの URL を貼り付けてください。');
    setFetching(true);
    try {
      const info = await fetchProductInfo(url);
      update({
        name: info.name,
        price: info.price || product.price,
        description: info.description,
        affiliateUrl: product.affiliateUrl || (looksLikeAffiliate(url) ? url : ''),
      });
      setImage(info.image);
      if (info.description) setShowMore(true);
      toast('商品情報を読み取りました。内容を確認してください。');
    } catch (e) {
      if (looksLikeAffiliate(url) && !product.affiliateUrl) update({ affiliateUrl: url });
      toast(e instanceof ApiError ? e.message : '読み取れませんでした。手入力してください。');
    } finally {
      setFetching(false);
    }
  };

  const toEditor = (p: Pattern, index: number) => {
    setSelected(index);
    setEditor({
      text: withDisclosure(p.body, settings.disclosure),
      reply: p.reply,
      topic: p.topic,
      link: product.affiliateUrl.trim(),
      productName: product.name.trim(),
      linkPlacement: settings.linkPlacement,
      historyId: null,
      favorite: false,
      posted: false,
    });
    setTimeout(() => scroll.current?.scrollTo({ y: editorY.current - 12, animated: true }), 100);
  };

  const run = async () => {
    if (!product.name.trim()) return toast('商品名を入力してください。');
    if (!credits) {
      toast('残り回数がありません。「設定」から回数を追加してください。');
      return setTab('settings');
    }
    setGenerating(true);
    try {
      const r = await generate(product, `${template.name}: ${template.instruction}`, settings.tone, settings.linkPlacement);
      setBalance({ credits: r.credits, freeCredits: r.freeCredits });
      setPatterns(r.patterns);
      setSelected(null);
      setEditor(null);
      setTimeout(() => scroll.current?.scrollTo({ y: resultsY.current - 12, animated: true }), 100);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '作成できませんでした。もう一度お試しください。');
      if (e instanceof ApiError && e.code === 'no_credits') refreshCredits();
    } finally {
      setGenerating(false);
    }
  };

  const save = async (patch: Partial<Editor>) => {
    if (!editor) return;
    const next = { ...editor, ...patch };
    const id = next.historyId ?? `${Date.now()}`;
    await upsertHistory({
      id,
      at: Date.now(),
      text: next.text,
      reply: next.reply,
      topic: next.topic,
      link: next.link,
      productName: next.productName,
      linkPlacement: next.linkPlacement,
      favorite: next.favorite,
      posted: next.posted,
    });
    setEditor({ ...next, historyId: id });
  };

  const warnings = useMemo(() => (editor ? checkExpressions(editor.text) : []), [editor]);
  const count = editor ? charCount(editor.text) : 0;
  const tooLong = count > THREADS_MAX_CHARS;

  const post = async () => {
    if (!editor) return;
    if (tooLong) return toast(`Threads は1投稿 ${THREADS_MAX_CHARS} 文字までです。短くしてください。`);
    if (!hasDisclosure(editor.text)) return toast('広告であることの表記（【PR】や #PR など）を入れてください。');
    const bodyLink = editor.linkPlacement === 'body' ? editor.link : undefined;
    const replyMode = editor.linkPlacement === 'reply' && !!editor.link;
    // iPhone の Safari はタップ直後でないとコピーや別画面を開く操作を拒否するため、
    // await を挟まずに先に実行し、履歴の保存は後で行う
    const copied = replyMode ? Clipboard.setStringAsync(`${editor.reply}\n${editor.link}`.trim()) : null;
    openThreads(editor.text, bodyLink || undefined, editor.topic || undefined);
    if (copied) {
      await copied.catch(() => {});
      toast('投稿後、自分の投稿にリプで貼り付けてください（リプ文とリンクをコピーしました）。');
    }
    await save({ posted: true });
  };

  const copy = async (text: string, message: string) => {
    await Clipboard.setStringAsync(text);
    await save({});
    toast(message);
  };

  const linkLabel = editor?.linkPlacement === 'reply' ? 'リプ文とリンクをコピー' : 'リンクをコピー';

  return (
    <ScrollView ref={scroll} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      {!welcomeHidden && (
        <View style={cs.hero}>
          <Text style={cs.heroTitle}>商品URLを貼るだけで、{'\n'}紹介ポストが3つできます</Text>
          <View style={cs.heroSteps}>
            {[
              ['link', 'URLを貼る'],
              ['sparkles', 'AIが3案作成'],
              ['paper-plane', 'Threadsへ'],
            ].map(([icon, label], i) => (
              <View key={label} style={cs.heroStep}>
                <View style={cs.heroIcon}>
                  <Icon name={icon as IconName} size={20} color={colors.accent} />
                </View>
                <Text style={cs.heroStepText}>
                  {i + 1}. {label}
                </Text>
              </View>
            ))}
          </View>
          <Pressable onPress={hideWelcome} style={cs.heroClose} accessibilityLabel="閉じる" hitSlop={10}>
            <Icon name="close" size={18} color={colors.sub} />
          </Pressable>
        </View>
      )}

      {credits === 0 && (
        <Card style={{ backgroundColor: colors.accentSoft }}>
          <View style={styles.row}>
            <Icon name="ticket-outline" size={22} color={colors.accentDark} />
            <Text style={{ fontWeight: '700', fontSize: 16, marginLeft: 8 }}>まずは回数を追加しましょう</Text>
          </View>
          <Text style={[styles.small, { marginTop: 6 }]}>
            1回で投稿文が3パターンできます。30回300円から。購入した回数に期限はありません。
          </Text>
          <Button title="回数を購入する" icon="cart" onPress={() => setTab('settings')} />
          <RewardedButton />
        </Card>
      )}

      <Section step={1} icon="bag-handle" title="紹介する商品" subtitle="商品ページのURLを貼って「読み取る」を押すと、商品名や価格が自動で入ります。">
        <View style={[styles.row, { marginTop: 12 }]}>
          <Field
            style={{ flex: 1 }}
            value={product.url}
            onChangeText={(url) => update({ url })}
            placeholder="https:// 商品ページのURL"
            autoCapitalize="none"
            keyboardType="url"
          />
          <Button title="読み取る" icon="scan" small onPress={readProduct} loading={fetching} style={{ marginLeft: 8, minHeight: 48 }} />
        </View>
        <Text style={[styles.small, { marginTop: 6, fontSize: 12 }]}>楽天市場・Yahoo!ショッピングなど。Amazon など読み取れないサイトは手入力でOK</Text>

        {product.name ? (
          <View style={cs.preview}>
            {image ? <Image source={{ uri: image }} style={cs.previewImg} /> : (
              <View style={[cs.previewImg, { alignItems: 'center', justifyContent: 'center' }]}>
                <Icon name="cube-outline" size={26} color={colors.faint} />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontWeight: '700' }} numberOfLines={2}>
                {product.name}
              </Text>
              {product.price ? <Text style={{ color: colors.accentDark, fontWeight: '700', marginTop: 4 }}>{product.price}</Text> : null}
            </View>
          </View>
        ) : null}

        <Label hint="必須">商品名</Label>
        <Field value={product.name} onChangeText={(name) => update({ name })} placeholder="例：折りたたみハンディファン" />
        <Label optional>価格</Label>
        <Field value={product.price} onChangeText={(price) => update({ price })} placeholder="例：2,980円" />
        <Label optional hint="あると体験談として書けます">あなたの感想</Label>
        <Field
          multiline
          value={product.experience}
          onChangeText={(experience) => update({ experience })}
          placeholder="例：通勤の電車で使ってる。音が静かで周りを気にしなくていい"
          maxLength={1000}
        />
        <Label hint="投稿に付けるリンク">アフィリエイトリンク</Label>
        <Field
          value={product.affiliateUrl}
          onChangeText={(affiliateUrl) => update({ affiliateUrl })}
          placeholder="https://hb.afl.rakuten.co.jp/..."
          autoCapitalize="none"
          keyboardType="url"
        />

        <Pressable onPress={() => setShowMore(!showMore)} style={cs.more} accessibilityRole="button">
          <Text style={{ color: colors.accentDark, fontWeight: '700' }}>{showMore ? 'くわしい設定を閉じる' : 'くわしく設定する（任意）'}</Text>
          <Icon name={showMore ? 'chevron-up' : 'chevron-down'} size={18} color={colors.accentDark} />
        </Pressable>
        {showMore && (
          <>
            <Label optional hint="箇条書きでOK">商品の特徴</Label>
            <Field
              multiline
              value={product.description}
              onChangeText={(description) => update({ description })}
              placeholder="例：重さ180g / USB充電で8時間 / 3段階の風量"
              maxLength={2000}
            />
            <Label optional>届けたい人</Label>
            <Field value={product.target} onChangeText={(target) => update({ target })} placeholder="例：暑がりの会社員" />
          </>
        )}
      </Section>

      <Section step={2} icon="color-palette" title="書き方を選ぶ">
        <Label>テンプレート</Label>
        <View style={cs.grid}>
          {templates.map((t) => {
            const on = t.id === template.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => updateSettings({ templateId: t.id })}
                style={[cs.tpl, on && cs.tplOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={{ fontSize: 22 }}>{t.emoji ?? '✏️'}</Text>
                <Text style={[{ fontSize: 13, marginTop: 4, textAlign: 'center' }, on && { fontWeight: '700', color: colors.accentDark }]} numberOfLines={1}>
                  {t.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.small, { fontSize: 12 }]}>{template.instruction}</Text>
        <Label>トーン</Label>
        <View style={styles.chips}>
          {TONES.map((t) => (
            <Chip key={t.label} icon={t.emoji} label={t.label} active={settings.tone === t.label} onPress={() => updateSettings({ tone: t.label })} />
          ))}
        </View>
        <Label>リンクの位置</Label>
        <View style={cs.segment}>
          {(
            [
              ['body', '投稿に付ける'],
              ['reply', 'リプ欄に貼る'],
            ] as const
          ).map(([k, label]) => (
            <Pressable
              key={k}
              onPress={() => updateSettings({ linkPlacement: k })}
              style={[cs.segItem, settings.linkPlacement === k && cs.segOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: settings.linkPlacement === k }}
            >
              <Text style={[{ fontSize: 14 }, settings.linkPlacement === k && { fontWeight: '700', color: colors.accentDark }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <View style={{ marginTop: 8 }}>
        <Button
          title={patterns.length ? '別の案を作る' : '投稿文を3つ作る'}
          icon="sparkles"
          onPress={run}
          loading={generating}
          style={{ minHeight: 58 }}
        />
        <Text style={[styles.small, { textAlign: 'center', marginTop: 8 }]}>1回分を使います（残り {credits ?? '—'} 回）</Text>
      </View>

      {generating && (
        <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Icon name="sparkles" size={28} color={colors.accent} />
          <Text style={{ fontWeight: '700', marginTop: 8 }}>AIが紹介文を考えています…</Text>
          <Text style={[styles.small, { marginTop: 4 }]}>10秒ほどお待ちください</Text>
        </Card>
      )}
      {generating && <AdSlot tab="create" />}

      {patterns.length > 0 && !generating && (
        <View onLayout={(e) => (resultsY.current = e.nativeEvent.layout.y)} style={{ marginTop: 20 }}>
          <View style={[styles.row, { marginBottom: 2 }]}>
            <Icon name="checkmark-circle" size={22} color={colors.ok} />
            <Text style={{ fontSize: 18, fontWeight: '700', marginLeft: 6 }}>3つの案ができました</Text>
          </View>
          <Text style={styles.small}>使いたい案をタップしてください</Text>
          {patterns.map((p, i) => {
            const on = selected === i;
            return (
              <Pressable key={i} onPress={() => toEditor(p, i)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <Card style={on ? cs.postOn : undefined}>
                  <View style={styles.row}>
                    <View style={cs.avatar}>
                      <Icon name="person" size={16} color="#fff" />
                    </View>
                    <Text style={{ fontWeight: '700', marginLeft: 8, flex: 1 }}>あなた</Text>
                    <Pill label={`案${i + 1}・${p.angle}`} tone={on ? 'warn' : 'neutral'} />
                  </View>
                  <Text style={cs.postBody}>{withDisclosure(p.body, settings.disclosure)}</Text>
                  {p.reply ? (
                    <View style={cs.replyBox}>
                      <Icon name="return-down-forward" size={14} color={colors.sub} />
                      <Text style={[styles.small, { marginLeft: 6, flex: 1 }]}>{p.reply}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.row, { justifyContent: 'space-between', marginTop: 10 }]}>
                    <Text style={[styles.small, { fontSize: 12 }]}>{charCount(withDisclosure(p.body, settings.disclosure))}文字</Text>
                    <Text style={{ color: colors.accentDark, fontWeight: '700', fontSize: 13 }}>{on ? '選択中' : 'この案を使う ›'}</Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}
          <AdSlot tab="create" />
        </View>
      )}

      {editor && (
        <Section step={3} icon="paper-plane" title="仕上げて投稿" onLayout={(y) => (editorY.current = y)}>
          <Text style={[styles.small, { marginTop: 2 }]}>そのまま使っても、自分の言葉に直してもOKです。</Text>
          <Field
            multiline
            value={editor.text}
            onChangeText={(text) => setEditor({ ...editor, text })}
            style={{ minHeight: 220, lineHeight: 24, marginTop: 12 }}
          />
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <Pill
              icon={hasDisclosure(editor.text) ? 'checkmark-circle' : 'alert-circle'}
              label={hasDisclosure(editor.text) ? '広告表記あり' : '広告表記がありません'}
              tone={hasDisclosure(editor.text) ? 'ok' : 'danger'}
            />
            <Pill icon="text" label={`${count} / ${THREADS_MAX_CHARS}文字`} tone={tooLong ? 'danger' : 'neutral'} />
            {warnings.length === 0 && <Pill icon="shield-checkmark" label="表現チェックOK" tone="ok" />}
          </View>

          {warnings.length > 0 && (
            <Card style={{ backgroundColor: colors.warnBg, marginTop: 10 }}>
              <View style={styles.row}>
                <Icon name="warning" size={18} color={colors.warn} />
                <Text style={{ fontWeight: '700', color: colors.warn, marginLeft: 6 }}>言い換えをおすすめする表現</Text>
              </View>
              {warnings.map((w) => (
                <Text key={w.word} style={[styles.small, { color: colors.warn, marginTop: 4 }]}>
                  「{w.word}」… {w.reason}
                </Text>
              ))}
            </Card>
          )}

          {editor.linkPlacement === 'reply' && (
            <>
              <Label hint="リンクと一緒にリプで使います">リプ用の一言</Label>
              <Field value={editor.reply} onChangeText={(reply) => setEditor({ ...editor, reply })} />
            </>
          )}
          <Label optional>リンク</Label>
          <Field
            value={editor.link}
            onChangeText={(link) => setEditor({ ...editor, link })}
            placeholder="アフィリエイトリンク"
            autoCapitalize="none"
            keyboardType="url"
          />
          <Label optional hint="Threads のトピック">トピック</Label>
          <Field value={editor.topic} onChangeText={(topic) => setEditor({ ...editor, topic })} maxLength={50} />

          <Button title="Threads で投稿する" icon="paper-plane" onPress={post} style={{ marginTop: 18, minHeight: 56 }} />
          <Text style={[styles.small, { textAlign: 'center', marginTop: 6, fontSize: 12 }]}>
            文章とリンクが入った Threads の投稿画面が開きます。内容を確認して投稿してください。
          </Text>
          <View style={[styles.row, { gap: 8, marginTop: 4 }]}>
            <Button title="コピー" icon="copy-outline" kind="secondary" style={{ flex: 1 }} onPress={() => copy(editor.text, '本文をコピーしました。')} />
            <Button
              title={editor.favorite ? '保存済み' : 'お気に入り'}
              icon={editor.favorite ? 'heart' : 'heart-outline'}
              kind="secondary"
              style={{ flex: 1 }}
              onPress={async () => {
                await save({ favorite: !editor.favorite });
                toast(editor.favorite ? 'お気に入りから外しました。' : 'お気に入りに保存しました。');
              }}
            />
          </View>
          {editor.link ? (
            <Button
              title={linkLabel}
              icon="link"
              kind="ghost"
              onPress={() =>
                copy(editor.linkPlacement === 'reply' ? `${editor.reply}\n${editor.link}`.trim() : editor.link, 'コピーしました。')
              }
            />
          ) : null}
          <ScheduleBox draft={editor} onScheduled={() => save({})} />
        </Section>
      )}
    </ScrollView>
  );
}

const cs = StyleSheet.create({
  hero: { backgroundColor: colors.accentSoft, borderRadius: 24, padding: 18, paddingRight: 40 },
  heroTitle: { fontSize: 18, fontWeight: '700', lineHeight: 27 },
  heroSteps: { flexDirection: 'row', marginTop: 14, gap: 8 },
  heroStep: { flex: 1, alignItems: 'center' },
  heroIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  heroStepText: { fontSize: 12, marginTop: 6, fontWeight: '700', color: colors.sub },
  heroClose: { position: 'absolute', top: 12, right: 12 },
  preview: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF9F5', borderRadius: 16, padding: 10, marginTop: 14 },
  previewImg: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#F4ECE5' },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, paddingVertical: 8, gap: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  tpl: {
    width: '31%',
    minWidth: 92,
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tplOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  segment: { flexDirection: 'row', backgroundColor: '#F6EEE7', borderRadius: 16, padding: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  segOn: { backgroundColor: colors.card },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  postBody: { fontSize: 15, lineHeight: 24, marginTop: 10 },
  postOn: { borderWidth: 2, borderColor: colors.accent },
  replyBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FAF4EF', borderRadius: 12, padding: 10, marginTop: 10 },
});
