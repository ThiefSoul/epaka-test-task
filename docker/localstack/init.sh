#!/bin/sh
set -eu

create_bucket() {
  bucket="$1"

  if awslocal s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    echo "Bucket already exists: $bucket"
    return
  fi

  awslocal s3 mb "s3://$bucket"
}

create_bucket epaka-hot
create_bucket epaka-archive
create_bucket epaka-test-hot
create_bucket epaka-test-archive
