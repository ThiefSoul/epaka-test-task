#!/bin/sh
set -eu

awslocal s3 mb s3://epaka-hot
awslocal s3 mb s3://epaka-archive
