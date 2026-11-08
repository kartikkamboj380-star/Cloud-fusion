/// Data models for CloudFusion metadata.
///
/// IMPORTANT (zero-local invariant): these objects describe remote files and
/// transfers. The actual bytes of any remote file are NEVER present in this
/// process — the backend moves data SOURCE -> GOOGLE DRIVE and sends us only
/// these JSON projections (ids, sizes, progress, speed, status).
library;

int _i(dynamic v, [int fallback = 0]) {
  if (v is int) return v;
  if (v is double) return v.toInt();
  if (v is String) return int.tryParse(v) ?? fallback;
  return fallback;
}

String _s(dynamic v, [String fallback = '']) => v is String ? v : fallback;

class Drive {
  Drive({
    required this.id,
    required this.displayName,
    required this.email,
    required this.status,
    required this.quotaTotal,
    required this.quotaUsed,
    required this.reservedBytes,
  });

  final String id;
  final String displayName;
  final String email;
  final String status;
  final int quotaTotal;
  final int quotaUsed;
  final int reservedBytes;

  int get quotaFree {
    final free = quotaTotal - quotaUsed - reservedBytes;
    return free < 0 ? 0 : free;
  }

  factory Drive.fromJson(Map<String, dynamic> j) => Drive(
        id: _s(j['id']),
        displayName: _s(j['displayName'], 'Drive'),
        email: _s(j['email']),
        status: _s(j['status'], 'unknown'),
        quotaTotal: _i(j['quotaTotal']),
        quotaUsed: _i(j['quotaUsed']),
        reservedBytes: _i(j['reservedBytes']),
      );
}

class PoolStats {
  PoolStats({
    required this.total,
    required this.used,
    required this.reserved,
    required this.available,
    required this.activeTransfers,
    required this.myFiles,
    required this.myPublicFiles,
  });

  final int total;
  final int used;
  final int reserved;
  final int available;
  final int activeTransfers;
  final int myFiles;
  final int myPublicFiles;

  factory PoolStats.fromJson(Map<String, dynamic> j) {
    final pool = (j['pool'] as Map?)?.cast<String, dynamic>() ?? const {};
    return PoolStats(
      total: _i(pool['total']),
      used: _i(pool['used']),
      reserved: _i(pool['reserved']),
      available: _i(pool['available']),
      activeTransfers: _i(j['activeTransfers']),
      myFiles: _i(j['myFiles']),
      myPublicFiles: _i(j['myPublicFiles']),
    );
  }
}

class TransferJob {
  TransferJob({
    required this.id,
    required this.fileName,
    required this.status,
    required this.progressBytes,
    required this.uploadedBytes,
    required this.speedBps,
    required this.connections,
    required this.rangeSupported,
    required this.chunkCount,
    required this.chunksDone,
    this.fileSize,
    this.error,
    this.driveLabel,
  });

  final String id;
  final String fileName;
  final String status;
  final int progressBytes;
  final int uploadedBytes;
  final int speedBps;
  final int connections;
  final bool rangeSupported;
  final int chunkCount;
  final int chunksDone;
  final int? fileSize;
  final String? error;
  final String? driveLabel;

  static const activeStatuses = {
    'queued', 'probing', 'allocating', 'downloading', 'uploading', 'verifying',
  };

  bool get isActive => activeStatuses.contains(status);
  bool get isPaused => status == 'paused';
  bool get canRetry => status == 'failed' || status == 'canceled';
  bool get canCancel => status != 'completed' && status != 'canceled';

  double get fraction {
    final size = fileSize;
    if (size == null || size <= 0) return 0;
    final done = status == 'uploading' || status == 'verifying' ? uploadedBytes : progressBytes;
    return (done / size).clamp(0.0, 1.0);
  }

  int get movingBytes =>
      status == 'uploading' || status == 'verifying' ? uploadedBytes : progressBytes;

  factory TransferJob.fromJson(Map<String, dynamic> j) => TransferJob(
        id: _s(j['id']),
        fileName: _s(j['fileName'], 'download.bin'),
        status: _s(j['status'], 'queued'),
        progressBytes: _i(j['progressBytes']),
        uploadedBytes: _i(j['uploadedBytes']),
        speedBps: _i(j['speedBps']),
        connections: _i(j['connections'], 1),
        rangeSupported: j['rangeSupported'] == true,
        chunkCount: _i(j['chunkCount']),
        chunksDone: _i(j['chunksDone']),
        fileSize: j['fileSize'] == null ? null : _i(j['fileSize']),
        error: j['error'] is String ? j['error'] as String : null,
        driveLabel: j['driveLabel'] is String ? j['driveLabel'] as String : null,
      );
}

class LibraryItem {
  LibraryItem({
    required this.id,
    required this.name,
    required this.size,
    required this.category,
    required this.mimeType,
    required this.publicDownloads,
    required this.uploader,
    this.description,
    this.shareSlug,
  });

  final String id;
  final String name;
  final int size;
  final String category;
  final String mimeType;
  final int publicDownloads;
  final String uploader;
  final String? description;
  final String? shareSlug;

  factory LibraryItem.fromJson(Map<String, dynamic> j) => LibraryItem(
        id: _s(j['id']),
        name: _s(j['name']),
        size: _i(j['size']),
        category: _s(j['category'], 'other'),
        mimeType: _s(j['mimeType']),
        publicDownloads: _i(j['publicDownloads']),
        uploader: _s(j['uploader'], 'unknown'),
        description: j['description'] is String ? j['description'] as String : null,
        shareSlug: j['shareSlug'] is String ? j['shareSlug'] as String : null,
      );
}

String fmtBytes(int n) {
  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;
  if (n >= gb) return '${(n / gb).toStringAsFixed(1)} GB';
  if (n >= mb) return '${(n / mb).toStringAsFixed(1)} MB';
  if (n >= 1024) return '${(n / 1024).toStringAsFixed(0)} KB';
  return '$n B';
}

String fmtSpeed(int bps) => bps <= 0 ? '0 MB/s' : '${(bps / (1024 * 1024)).toStringAsFixed(1)} MB/s';
