#!/usr/bin/env bash
set -euo pipefail

echo "=== /proc/diskstats ==="
cat /proc/diskstats | awk '$3 ~ /nvme/ {print}'

echo ""
echo "=== Partition-to-base mapping ==="
cat /proc/diskstats | awk '$3 ~ /nvme/ {
    name = $3
    if (name ~ /p[0-9]+$/) {
        base = name
        sub(/p[0-9]+$/, "", base)
        print "  " name " -> " base
    } else {
        print "  " name " (base)"
    }
}'

echo ""
echo "=== Mounts for nvme devices ==="
grep nvme /proc/mounts || echo "  (none)"

echo ""
echo "=== lsblk ==="
lsblk -d -o NAME,SIZE,ROTA,TYPE | grep nvme || echo "  (none)"

echo ""
echo "=== /sys/block nvme stats (cumulative) ==="
for dev in nvme0n1 nvme1n1; do
    if [ -f "/sys/block/$dev/stat" ]; then
        echo "  $dev: $(cat /sys/block/$dev/stat)"
    fi
done
