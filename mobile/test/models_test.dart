import 'package:cloudfusion_mobile/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TransferJob parses an engine payload and computes progress', () {
    final job = TransferJob.fromJson({
      'id': 'job-1',
      'fileName': 'ubuntu.iso',
      'status': 'downloading',
      'progressBytes': 536870912,
      'uploadedBytes': 0,
      'speedBps': 67108864,
      'connections': 8,
      'rangeSupported': true,
      'chunkCount': 256,
      'chunksDone': 128,
      'fileSize': 1073741824,
    });

    expect(job.fileName, 'ubuntu.iso');
    expect(job.isActive, isTrue);
    expect(job.fraction, closeTo(0.5, 0.001));
    expect(job.canRetry, isFalse);
  });

  test('Drive.free never goes negative under reservations', () {
    final d = Drive.fromJson({
      'id': 'd1',
      'displayName': 'Drive A',
      'email': 'a@b.c',
      'status': 'connected',
      'quotaTotal': 100,
      'quotaUsed': 90,
      'reservedBytes': 50,
    });
    expect(d.quotaFree, 0);
  });

  test('PoolStats parses pool totals (45 GB spec example)', () {
    final s = PoolStats.fromJson({
      'pool': {
        'total': 64424509440,
        'used': 16106127360,
        'reserved': 3221225472,
        'available': 45103008768,
      },
      'activeTransfers': 2,
      'myFiles': 9,
      'myPublicFiles': 6,
    });
    expect(s.available, 45103008768);
    expect(s.activeTransfers, 2);
  });
}
