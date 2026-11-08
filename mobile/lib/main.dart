/// CloudFusion Android client.
///
/// LOW-RAM / LOW-STORAGE DESIGN CONTRACT
/// -------------------------------------
/// - This app is a remote control: it exchanges small JSON only. Remote file
///   bytes NEVER exist on this device (no Downloads, no cache, no temp files,
///   no whole-file byte arrays, no Android DownloadManager usage).
/// - Lists are lazy (ListView.builder), paginated (pageSize ≤ 24) and rebuilt
///   only from metadata.
/// - Polling is adaptive: ~2s while a transfer is live, stopped when idle,
///   cancelled on dispose. No background isolates, no wakelocks.
/// - Persisted state is two strings (server URL + session cookie). If Android
///   kills the process, jobs keep running server-side and the UI re-syncs.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'models.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = await ApiClient.restore();
  runApp(CloudFusionApp(api: api));
}

const _bg = Color(0xFF04060D);
const _panel = Color(0xFF0B1024);
const _cyan = Color(0xFF38E1FF);
const _violet = Color(0xFF8B5CF6);
const _lime = Color(0xFFA3E635);
const _red = Color(0xFFF4707F);
const _amber = Color(0xFFFBBF24);

class CloudFusionApp extends StatelessWidget {
  const CloudFusionApp({super.key, required this.api});

  final ApiClient api;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CloudFusion',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: _bg,
        colorScheme: ColorScheme.fromSeed(seedColor: _cyan, brightness: Brightness.dark),
        snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
      ),
      home: RootGate(api: api),
    );
  }
}

/// Decides between login and the console, surviving process death via the
/// persisted session cookie.
class RootGate extends StatefulWidget {
  const RootGate({super.key, required this.api});

  final ApiClient api;

  @override
  State<RootGate> createState() => _RootGateState();
}

class _RootGateState extends State<RootGate> {
  bool? _authed;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    final ok = await widget.api.isAuthed();
    if (mounted) setState(() => _authed = ok);
  }

  @override
  Widget build(BuildContext context) {
    final authed = _authed;
    if (authed == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator(color: _cyan)));
    }
    if (!authed) {
      return LoginScreen(
        api: widget.api,
        onAuthed: () => setState(() => _authed = true),
      );
    }
    return HomeTabs(
      api: widget.api,
      onLogout: () => setState(() => _authed = false),
    );
  }
}

// ---------------------------------------------------------------------------

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api, required this.onAuthed});

  final ApiClient api;
  final VoidCallback onAuthed;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final TextEditingController _server =
      TextEditingController(text: widget.api.baseUrl);
  bool _busy = false;
  String? _error;

  Future<void> _login() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.demoLogin(_server.text);
      widget.onAuthed();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Could not reach the relay at that URL.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _server.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const SizedBox(height: 48),
            const Icon(Icons.bolt, color: _cyan, size: 44),
            const SizedBox(height: 12),
            Text('CloudFusion',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            const Text(
              'Remote-control for zero-local cloud transfers.\nThis device never stores file bytes.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            TextField(
              controller: _server,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'Relay URL',
                hintText: 'http://10.0.2.2:3000',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _busy ? null : _login,
              icon: const Icon(Icons.login),
              label: Text(_busy ? 'Connecting…' : 'Use demo session'),
            ),
            const SizedBox(height: 8),
            const Text(
              'Google sign-in happens in the web console (OAuth 2.0).\nThe app only stores this URL + a session cookie.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: Colors.white54),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: _red)),
            ],
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------

class HomeTabs extends StatefulWidget {
  const HomeTabs({super.key, required this.api, required this.onLogout});

  final ApiClient api;
  final VoidCallback onLogout;

  @override
  State<HomeTabs> createState() => _HomeTabsState();
}

class _HomeTabsState extends State<HomeTabs> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final tabs = [
      PoolTab(api: widget.api),
      TransfersTab(api: widget.api),
      LibraryTab(api: widget.api),
    ];
    return Scaffold(
      appBar: AppBar(
        backgroundColor: _bg,
        title: const Row(children: [
          Icon(Icons.bolt, color: _cyan, size: 20),
          SizedBox(width: 8),
          Text('CloudFusion', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        ]),
        actions: [
          const Padding(
            padding: EdgeInsets.only(right: 8),
            child: Chip(
              visualDensity: VisualDensity.compact,
              avatar: Icon(Icons.verified_user, size: 14, color: _lime),
              label: Text('0 LOCAL BYTES', style: TextStyle(fontSize: 10, letterSpacing: 1)),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.logout, size: 20),
            onPressed: () async {
              await widget.api.logout();
              widget.onLogout();
            },
          ),
        ],
      ),
      body: tabs[_index],
      bottomNavigationBar: NavigationBar(
        backgroundColor: _panel,
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dns_outlined), label: 'Pool'),
          NavigationDestination(icon: Icon(Icons.swap_vert), label: 'Transfers'),
          NavigationDestination(icon: Icon(Icons.public), label: 'Library'),
        ],
      ),
    );
  }
}

void _toast(BuildContext context, String text) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

// ---------------------------------------------------------------------------

class PoolTab extends StatefulWidget {
  const PoolTab({super.key, required this.api});

  final ApiClient api;

  @override
  State<PoolTab> createState() => _PoolTabState();
}

class _PoolTabState extends State<PoolTab> {
  PoolStats? _stats;
  List<Drive> _drives = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    try {
      final results = await Future.wait([widget.api.stats(), widget.api.drives()]);
      if (mounted) {
        setState(() {
          _stats = results[0] as PoolStats;
          _drives = results[1] as List<Drive>;
          _loading = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) _toast(context, e.message);
    }
  }

  Future<void> _addDemoDrive() async {
    try {
      await widget.api.addDemoDrive();
      await _refresh();
    } on ApiException catch (e) {
      if (mounted) _toast(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final stats = _stats;
    return RefreshIndicator(
      color: _cyan,
      onRefresh: _refresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: _panel,
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(children: [
                Text(stats == null ? '—' : fmtBytes(stats.available),
                    style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900, color: _cyan)),
                const Text('POOLED AVAILABLE', style: TextStyle(fontSize: 11, letterSpacing: 2)),
                const SizedBox(height: 8),
                Text(
                  stats == null
                      ? 'syncing…'
                      : 'used ${fmtBytes(stats.used)} · reserved ${fmtBytes(stats.reserved)} · '
                          '${stats.activeTransfers} active jobs',
                  style: const TextStyle(fontSize: 12, color: Colors.white54),
                ),
              ]),
            ),
          ),
          const SizedBox(height: 16),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            const Text('Connected drives', style: TextStyle(fontWeight: FontWeight.w700)),
            TextButton.icon(
                onPressed: _addDemoDrive, icon: const Icon(Icons.add, size: 16), label: const Text('Demo drive')),
          ]),
          if (_loading) const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
          ..._drives.map((d) => Card(
                color: _panel,
                child: ListTile(
                  dense: true,
                  leading: const Icon(Icons.sd_storage, color: _violet),
                  title: Text(d.displayName, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14)),
                  subtitle: Text('${fmtBytes(d.quotaFree)} free of ${fmtBytes(d.quotaTotal)}',
                      style: const TextStyle(fontSize: 12, color: Colors.white54)),
                  trailing: Text(d.status,
                      style: TextStyle(fontSize: 11, color: d.status == 'demo' ? Colors.white38 : _lime)),
                ),
              )),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------

class TransfersTab extends StatefulWidget {
  const TransfersTab({super.key, required this.api});

  final ApiClient api;

  @override
  State<TransfersTab> createState() => _TransfersTabState();
}

class _TransfersTabState extends State<TransfersTab> {
  final TextEditingController _url = TextEditingController();
  double _connections = 4;
  List<TransferJob> _jobs = const [];
  Timer? _timer;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _url.dispose();
    super.dispose();
  }

  /// Adaptive polling: fast while work is live, OFF when idle (battery + data
  /// friendly). Re-armed only after actions that create activity.
  void _armTimer() {
    _timer?.cancel();
    if (_jobs.any((j) => j.isActive)) {
      _timer = Timer(const Duration(milliseconds: 2000), _refresh);
    }
  }

  Future<void> _refresh() async {
    try {
      final jobs = await widget.api.transfers();
      if (mounted) setState(() => _jobs = jobs);
    } on ApiException {
      // transient network — try again on next arm
    }
    _armTimer();
  }

  Future<void> _start() async {
    final url = _url.text.trim();
    if (url.isEmpty || _submitting) return;
    setState(() => _submitting = true);
    try {
      await widget.api.startTransfer(url, _connections.round());
      _url.clear();
      if (mounted) _toast(context, 'Remote job started — 0 bytes on this device.');
    } on ApiException catch (e) {
      if (mounted) _toast(context, e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
    await _refresh();
  }

  Future<void> _control(TransferJob job, String action) async {
    try {
      await widget.api.control(job.id, action);
    } on ApiException catch (e) {
      if (mounted) _toast(context, e.message);
    }
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Column(children: [
          TextField(
            controller: _url,
            keyboardType: TextInputType.url,
            decoration: InputDecoration(
              labelText: 'Paste direct download link',
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(
                icon: const Icon(Icons.send, color: _cyan),
                onPressed: _submitting ? null : _start,
              ),
            ),
            onSubmitted: (_) => _start(),
          ),
          Row(children: [
            Expanded(
              child: Slider(
                value: _connections,
                min: 1,
                max: 50,
                divisions: 49,
                label: '${_connections.round()} connections',
                onChanged: (v) => setState(() => _connections = v),
              ),
            ),
            Text('${_connections.round()}×',
                style: const TextStyle(fontWeight: FontWeight.w800, color: _cyan)),
            const SizedBox(width: 8),
          ]),
        ]),
      ),
      Expanded(
        child: _jobs.isEmpty
            ? const Center(child: Text('No transfers yet', style: TextStyle(color: Colors.white38)))
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: _jobs.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) {
                  final j = _jobs[i];
                  return Card(
                    color: _panel,
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(
                            child: Text(j.fileName,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                          ),
                          _statusChip(j.status),
                        ]),
                        const SizedBox(height: 8),
                        LinearProgressIndicator(
                          value: j.status == 'completed' ? 1 : j.fraction,
                          backgroundColor: Colors.white10,
                          color: j.status == 'failed'
                              ? _red
                              : j.isPaused
                                  ? _amber
                                  : _cyan,
                          minHeight: 6,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '${(j.fraction * 100).toStringAsFixed(1)}% · ${fmtBytes(j.movingBytes)} / '
                          '${j.fileSize == null ? '—' : fmtBytes(j.fileSize!)} · '
                          '${j.isActive ? fmtSpeed(j.speedBps) : j.status} · ${j.connections}×'
                          '${j.chunkCount > 1 ? ' · ${j.chunksDone}/${j.chunkCount} chunks' : ''}',
                          style: const TextStyle(fontSize: 11, color: Colors.white54),
                        ),
                        if (j.error != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(j.error!, style: const TextStyle(fontSize: 11, color: _red)),
                          ),
                        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                          if (j.isActive)
                            IconButton(
                                icon: const Icon(Icons.pause, size: 20),
                                onPressed: () => _control(j, 'pause')),
                          if (j.isPaused)
                            IconButton(
                                icon: const Icon(Icons.play_arrow, size: 20, color: _lime),
                                onPressed: () => _control(j, 'resume')),
                          if (j.canRetry)
                            IconButton(
                                icon: const Icon(Icons.refresh, size: 20, color: _amber),
                                onPressed: () => _control(j, 'retry')),
                          if (j.canCancel)
                            IconButton(
                                icon: const Icon(Icons.close, size: 20, color: _red),
                                onPressed: () => _control(j, 'cancel')),
                        ]),
                      ]),
                    ),
                  );
                },
              ),
      ),
    ]);
  }

  Widget _statusChip(String status) {
    final color = switch (status) {
      'completed' => _lime,
      'failed' => _red,
      'paused' => _amber,
      'canceled' => Colors.white38,
      _ => _cyan,
    };
    return Text(status, style: TextStyle(fontSize: 10, color: color, letterSpacing: 1));
  }
}

// ---------------------------------------------------------------------------

class LibraryTab extends StatefulWidget {
  const LibraryTab({super.key, required this.api});

  final ApiClient api;

  @override
  State<LibraryTab> createState() => _LibraryTabState();
}

class _LibraryTabState extends State<LibraryTab> {
  final TextEditingController _q = TextEditingController();
  List<LibraryItem> _items = const [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _search();
  }

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    setState(() => _loading = true);
    try {
      final items = await widget.api.library(q: _q.text.trim());
      if (mounted) setState(() => _items = items);
    } on ApiException catch (e) {
      if (mounted) _toast(context, e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save(LibraryItem item) async {
    final slug = item.shareSlug;
    if (slug == null) return;
    try {
      final drive = await widget.api.saveToPool(slug);
      if (mounted) _toast(context, 'Saved to $drive — cloud-to-cloud, 0 bytes here.');
    } on ApiException catch (e) {
      if (mounted) _toast(context, e.message);
    }
  }

  Future<void> _report(LibraryItem item) async {
    final slug = item.shareSlug;
    if (slug == null) return;
    final controller = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _panel,
        title: const Text('Report file', style: TextStyle(fontSize: 16)),
        content: TextField(
          controller: controller,
          maxLines: 3,
          decoration: const InputDecoration(
            hintText: 'Describe the issue (copyright needs ≥ 20 chars)',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Submit')),
        ],
      ),
    );
    if (submitted == true) {
      try {
        await widget.api.report(slug, 'copyright', controller.text);
        if (mounted) _toast(context, 'Report filed for moderation.');
      } on ApiException catch (e) {
        if (mounted) _toast(context, e.message);
      }
    }
    controller.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: TextField(
          controller: _q,
          decoration: const InputDecoration(
            labelText: 'Search public library',
            prefixIcon: Icon(Icons.search),
            border: OutlineInputBorder(),
          ),
          onSubmitted: (_) => _search(),
        ),
      ),
      Expanded(
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: _cyan))
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: _items.length,
                itemBuilder: (context, i) {
                  final item = _items[i];
                  return Card(
                    color: _panel,
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(item.name,
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                        const SizedBox(height: 4),
                        Text('${fmtBytes(item.size)} · ${item.category} · by ${item.uploader} · '
                            '${item.publicDownloads} saves',
                            style: const TextStyle(fontSize: 11, color: Colors.white54)),
                        if (item.description != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(item.description!,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 12, color: Colors.white70)),
                          ),
                        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                          TextButton.icon(
                            onPressed: () => _save(item),
                            icon: const Icon(Icons.cloud_download_outlined, size: 16, color: _cyan),
                            label: const Text('Save to my pool', style: TextStyle(fontSize: 12)),
                          ),
                          IconButton(
                            icon: const Icon(Icons.flag_outlined, size: 18, color: _red),
                            onPressed: () => _report(item),
                          ),
                        ]),
                      ]),
                    ),
                  );
                },
              ),
      ),
    ]);
  }
}
