/// Thin JSON client for the CloudFusion backend.
///
/// The ONLY payloads crossing this class are control messages and metadata.
/// There is deliberately no method that streams file content to the device —
/// remote transfers are executed entirely server-side (zero-local invariant).
library;

import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

class ApiException implements Exception {
  ApiException(this.message, this.statusCode);
  final String message;
  final int statusCode;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({required this.baseUrl, String? cookie}) : _cookie = cookie;

  static const _keyBase = 'cf_base';
  static const _keyCookie = 'cf_cookie';

  String baseUrl;
  String? _cookie;

  static Future<ApiClient> restore() async {
    final prefs = await SharedPreferences.getInstance();
    return ApiClient(
      baseUrl: prefs.getString(_keyBase) ?? 'http://10.0.2.2:3000', // Android emulator loopback
      cookie: prefs.getString(_keyCookie),
    );
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyBase, baseUrl);
    if (_cookie != null) {
      await prefs.setString(_keyCookie, _cookie!);
    } else {
      await prefs.remove(_keyCookie);
    }
  }

  Map<String, String> get _headers => {
        'content-type': 'application/json',
        if (_cookie != null) 'cookie': _cookie!,
      };

  void _captureCookies(http.Response res) {
    final setCookie = res.headers['set-cookie'];
    if (setCookie == null) return;
    final uid = RegExp('cf_uid=[^;,\\s]+').firstMatch(setCookie)?.group(0);
    final sig = RegExp('cf_sig=[^;,\\s]+').firstMatch(setCookie)?.group(0);
    if (uid != null && sig != null) {
      _cookie = '$uid; $sig';
    }
  }

  Future<Map<String, dynamic>> _req(String method, String path, [Map<String, dynamic>? body]) async {
    final uri = Uri.parse('$baseUrl$path');
    late http.Response res;
    switch (method) {
      case 'GET':
        res = await http.get(uri, headers: _headers).timeout(const Duration(seconds: 20));
      case 'POST':
        res = await http
            .post(uri, headers: _headers, body: jsonEncode(body ?? const {}))
            .timeout(const Duration(seconds: 30));
      case 'DELETE':
        res = await http.delete(uri, headers: _headers).timeout(const Duration(seconds: 20));
      default:
        res = await http
            .patch(uri, headers: _headers, body: jsonEncode(body ?? const {}))
            .timeout(const Duration(seconds: 20));
    }
    _captureCookies(res);
    await _persist();
    if (res.statusCode >= 400) {
      String message = 'HTTP ${res.statusCode}';
      try {
        final decoded = jsonDecode(res.body) as Map<String, dynamic>;
        if (decoded['error'] is String) message = decoded['error'] as String;
      } on FormatException {
        // keep HTTP fallback message
      }
      throw ApiException(message, res.statusCode);
    }
    return (jsonDecode(res.body) as Map).cast<String, dynamic>();
  }

  // -------------------------------------------------------------------------

  Future<bool> isAuthed() async {
    try {
      final j = await _req('GET', '/api/session');
      return j['user'] != null;
    } on ApiException {
      return false;
    }
  }

  Future<String?> demoLogin(String newBaseUrl) async {
    baseUrl = newBaseUrl.trim().replaceAll(RegExp(r'/$'), '');
    final j = await _req('POST', '/api/session');
    final user = (j['user'] as Map?)?.cast<String, dynamic>();
    if (user == null) throw ApiException('Login failed', 401);
    return user['name'] as String?;
  }

  Future<void> logout() async {
    try {
      await _req('DELETE', '/api/session');
    } finally {
      _cookie = null;
      await _persist();
    }
  }

  Future<PoolStats> stats() async => PoolStats.fromJson(await _req('GET', '/api/stats'));

  Future<List<Drive>> drives() async {
    final j = await _req('GET', '/api/drives');
    return ((j['drives'] as List?) ?? const [])
        .map((d) => Drive.fromJson((d as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<void> addDemoDrive() => _req('POST', '/api/drives');

  Future<void> disconnectDrive(String id) => _req('DELETE', '/api/drives/$id');

  Future<List<TransferJob>> transfers({int page = 1}) async {
    final j = await _req('GET', '/api/transfers?page=$page&pageSize=24');
    return ((j['items'] as List?) ?? const [])
        .map((t) => TransferJob.fromJson((t as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<void> startTransfer(String url, int connections) =>
      _req('POST', '/api/transfers', {'url': url, 'connections': connections});

  Future<void> control(String jobId, String action) =>
      _req('POST', '/api/transfers/$jobId/control', {'action': action});

  Future<List<LibraryItem>> library({String q = '', String category = '', int page = 1}) async {
    final params = ['page=$page', 'pageSize=12'];
    if (q.isNotEmpty) params.add('q=${Uri.encodeQueryComponent(q)}');
    if (category.isNotEmpty && category != 'all') params.add('category=$category');
    final j = await _req('GET', '/api/library?${params.join('&')}');
    return ((j['items'] as List?) ?? const [])
        .map((t) => LibraryItem.fromJson((t as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<String> saveToPool(String shareSlug) async {
    final j = await _req('POST', '/api/library/$shareSlug/save');
    return j['drive'] as String? ?? 'your pool';
  }

  Future<void> report(String shareSlug, String reason, String details) =>
      _req('POST', '/api/library/$shareSlug/report', {'reason': reason, 'details': details});
}
