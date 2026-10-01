import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../AppContext';
import { ApiError, fetchProductInfo, generate } from '../api';
import { THREADS_MAX_CHARS } from '../config';
import { charCount, checkExpressions, hasDisclosure, isHttpUrl, looksLikeAffiliate, withDisclosure } from '../compliance';
import { BUILT_IN_TEMPLATES, loadCustomTemplates, loadProductDraft, saveProductDraft, upsertHistory } from '../storage';
import { openThreads } from '../threads';
import { Draft, Pattern, ProductForm, Template, emptyProduct } from '../types';
import { Button, Card, Chip, Field, Label, StepTitle, colors, styles } from '../ui';
import ScheduleBox from './ScheduleBox';

const TONES = ['カジュアル', '丁寧', '熱量高め', '落ち着いた'];
const K_RESULT = 'last_result_v1';

interface Editor extends Draft {
  /** 履歴に保存済みならその ID */
  historyId: string | null;
  favorite: boolean;
  posted: boolean;
}

export default function CreateScreen() {
  const { tab, settings, updateSettings, credits, setCredits, setTab, toast, reopen, openInEditor } = useApp();
  const [product, setProduct] = useState<ProductForm>(emptyProduct);
  const [image, setImage] = useState('');
  const [templates, setTemplates] = useState<Template[]>(BUILT_IN_TEMPLATES);
  const [fetching, setFetching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const scroll = useRef<ScrollView>(null);
  const resultsY = useRef(0);
  const editorY = useRef(0);

  useEffect(() => {
    loadProductDraft().then(setProduct);
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
      setCredits(r.credits);
      setPatterns(r.patterns);
      setSelected(null);
      setEditor(null);
      setTimeout(() => scroll.current?.scrollTo({ y: resultsY.current - 12, animated: true }), 100);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '作成できませんでした。もう一度お試しください。');
      if (e instanceof ApiError && e.code === 'no_credits') setCredits(0);
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

  return (
    <ScrollView ref={scroll} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      {credits === 0 && (
        <Card style={{ backgroundColor: colors.highlightBg, borderColor: colors.highlightBg }}>
          <Text style={{ fontWeight: '800', color: colors.text, fontSize: 15 }}>はじめに回数を追加してください</Text>
          <Text style={[styles.small, { marginTop: 4 }]}>
            1回の作成で、投稿文を3パターン作れます。購入した回数に期限はありません。
          </Text>
          <Button title="回数を追加する" kind="highlight" onPress={() => setTab('settings')} />
        </Card>
      )}

      <StepTitle n={1} title="商品" />
      <Label hint="楽天・Yahoo!など。アフィリエイトリンクも可">商品ページの URL</Label>
      <View style={styles.row}>
        <Field
          style={{ flex: 1 }}
          value={product.url}
          onChangeText={(url) => update({ url })}
          placeholder="https://..."
          autoCapitalize="none"
          keyboardType="url"
        />
        <Button title="読み取る" small onPress={readProduct} loading={fetching} style={{ marginLeft: 8, minHeight: 46 }} />
      </View>
      <Text style={[styles.small, { marginTop: 6 }]}>読み取れないサイト（Amazon など）は、下の欄に手入力してください。</Text>

      {image ? <Image source={{ uri: image }} style={{ width: 96, height: 96, borderRadius: 8, marginTop: 12 }} /> : null}

      <Label hint="必須">商品名</Label>
      <Field value={product.name} onChangeText={(name) => update({ name })} placeholder="例: 折りたたみ電動ミニファン" />
      <Label>価格</Label>
      <Field value={product.price} onChangeText={(price) => update({ price })} placeholder="例: 2,980円" />
      <Label hint="箇条書きでOK">商品の特徴</Label>
      <Field
        multiline
        value={product.description}
        onChangeText={(description) => update({ description })}
        placeholder="例: 重さ180g / USB充電で8時間 / 3段階の風量"
        maxLength={2000}
      />
      <Label hint="任意。あると体験談として書けます">あなたの使用感</Label>
      <Field
        multiline
        value={product.experience}
        onChangeText={(experience) => update({ experience })}
        placeholder="例: 通勤の電車で使ってる。音が静かで周りを気にしなくていい"
        maxLength={1000}
      />
      <Label hint="任意">届けたい人</Label>
      <Field value={product.target} onChangeText={(target) => update({ target })} placeholder="例: 暑がりの会社員" />
      <Label hint="投稿に付けるリンク">アフィリエイトリンク</Label>
      <Field
        value={product.affiliateUrl}
        onChangeText={(affiliateUrl) => update({ affiliateUrl })}
        placeholder="https://hb.afl.rakuten.co.jp/..."
        autoCapitalize="none"
        keyboardType="url"
      />

      <StepTitle n={2} title="書き方" />
      <Label>テンプレート</Label>
      <View style={styles.chips}>
        {templates.map((t) => (
          <Chip key={t.id} label={t.name} active={t.id === template.id} onPress={() => updateSettings({ templateId: t.id })} />
        ))}
      </View>
      <Text style={styles.small}>{template.instruction}</Text>
      <Label>トーン</Label>
      <View style={styles.chips}>
        {TONES.map((t) => (
          <Chip key={t} label={t} active={settings.tone === t} onPress={() => updateSettings({ tone: t })} />
        ))}
      </View>
      <Label>リンクの位置</Label>
      <View style={styles.chips}>
        <Chip label="投稿にリンクを付ける" active={settings.linkPlacement === 'body'} onPress={() => updateSettings({ linkPlacement: 'body' })} />
        <Chip label="リプ欄に貼る" active={settings.linkPlacement === 'reply'} onPress={() => updateSettings({ linkPlacement: 'reply' })} />
      </View>

      <StepTitle n={3} title="作成" />
      <Button
        title={patterns.length ? '別の案を作る（1回分）' : '投稿文を3パターン作る（1回分）'}
        onPress={run}
        loading={generating}
      />
      <Text style={[styles.small, { textAlign: 'center', marginTop: 6 }]}>
        残り {credits ?? '—'} 回{generating ? '　作成中…（10秒ほどかかります）' : ''}
      </Text>

      {patterns.length > 0 && (
        <View onLayout={(e) => (resultsY.current = e.nativeEvent.layout.y)}>
          <Label>使う案を選んでください</Label>
          {patterns.map((p, i) => (
            <Pressable key={i} onPress={() => toEditor(p, i)} accessibilityRole="button">
              <Card style={selected === i ? { borderColor: colors.highlight, borderWidth: 2 } : undefined}>
                <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
                  <Text style={{ fontWeight: '800', color: colors.highlight }}>
                    案{i + 1}　{p.angle}
                  </Text>
                  <Text style={styles.small}>{charCount(withDisclosure(p.body, settings.disclosure))}文字</Text>
                </View>
                <Text style={{ fontSize: 15, lineHeight: 23, color: colors.text }}>{p.body}</Text>
                {p.reply ? <Text style={[styles.small, { marginTop: 8 }]}>リプ: {p.reply}</Text> : null}
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      {editor && (
        <View onLayout={(e) => (editorY.current = e.nativeEvent.layout.y)}>
          <StepTitle n={4} title="編集して投稿" />
          <Field multiline value={editor.text} onChangeText={(text) => setEditor({ ...editor, text })} style={{ minHeight: 200, lineHeight: 23 }} />
          <View style={[styles.row, { justifyContent: 'space-between', marginTop: 6 }]}>
            <Text style={[styles.small, !hasDisclosure(editor.text) && { color: colors.danger }]}>
              {hasDisclosure(editor.text) ? '広告表記あり' : '広告表記がありません'}
            </Text>
            <Text style={[styles.small, tooLong && { color: colors.danger, fontWeight: '700' }]}>
              {count} / {THREADS_MAX_CHARS}
            </Text>
          </View>

          {warnings.length > 0 && (
            <Card style={{ backgroundColor: colors.warnBg, borderColor: colors.warnBg }}>
              <Text style={{ fontWeight: '700', color: colors.warn, marginBottom: 4 }}>表現のチェック</Text>
              {warnings.map((w) => (
                <Text key={w.word} style={[styles.small, { color: colors.warn }]}>
                  「{w.word}」… {w.reason}
                </Text>
              ))}
            </Card>
          )}

          {editor.linkPlacement === 'reply' && (
            <>
              <Label hint="リンクと一緒に、自分の投稿へのリプで使います">リプ用の一言</Label>
              <Field value={editor.reply} onChangeText={(reply) => setEditor({ ...editor, reply })} />
            </>
          )}
          <Label>リンク</Label>
          <Field
            value={editor.link}
            onChangeText={(link) => setEditor({ ...editor, link })}
            placeholder="アフィリエイトリンク（任意）"
            autoCapitalize="none"
            keyboardType="url"
          />
          <Label hint="Threads のトピックタグ（任意）">トピック</Label>
          <Field value={editor.topic} onChangeText={(topic) => setEditor({ ...editor, topic })} maxLength={50} />

          <Button title="Threads で投稿画面を開く" kind="highlight" onPress={post} />
          <Text style={[styles.small, { textAlign: 'center', marginTop: 6 }]}>
            文章とリンクが入った状態で Threads が開きます。内容を確認して投稿してください。
          </Text>
          <View style={[styles.row, { gap: 8, marginTop: 4 }]}>
            <Button title="本文をコピー" kind="secondary" style={{ flex: 1 }} onPress={() => copy(editor.text, '本文をコピーしました。')} />
            <Button
              title={editor.favorite ? '★ 保存済み' : '☆ お気に入り'}
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
              title={editor.linkPlacement === 'reply' ? 'リプ文とリンクをコピー' : 'リンクをコピー'}
              kind="secondary"
              onPress={() =>
                copy(editor.linkPlacement === 'reply' ? `${editor.reply}\n${editor.link}`.trim() : editor.link, 'コピーしました。')
              }
            />
          ) : null}
          <ScheduleBox draft={editor} onScheduled={() => save({})} />
        </View>
      )}
    </ScrollView>
  );
}
