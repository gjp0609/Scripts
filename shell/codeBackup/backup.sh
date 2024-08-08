#!/bin/bash

# 检查参数
if [ "$#" -ne 2 ]; then
  echo "用法: $0 <SOURCE_GIT_DIR> <BACKUP_DIR>"
  exit 1
fi

# 参数
SOURCE_GIT_DIR="$1"
BACKUP_DIR="$2"
BUNDLE_FILE="$BACKUP_DIR/.bundle"
FULL_BUNDLE="$BACKUP_DIR/full.bundle"

# 检查源 Git 目录是否存在
if [ ! -d "$SOURCE_GIT_DIR/.git" ]; then
  echo "源目录 $SOURCE_GIT_DIR 不是一个 Git 仓库，请提供有效的 Git 仓库目录。"
  exit 1
fi

# 进入源 Git 目录
cd "$SOURCE_GIT_DIR" || exit

# 检查 .bundle 文件是否存在
if [ ! -f "$BUNDLE_FILE" ]; then
  # 如果 .bundle 文件不存在，则创建一个新的文件并生成完全包
  echo "没有找到 $BUNDLE_FILE 文件，创建一个新的 $BUNDLE_FILE 文件并生成完全包。"
  echo > "$BUNDLE_FILE" # 创建空的 .bundle 文件
  git bundle create "$FULL_BUNDLE" --all
  # 记录当前最新的 commit hash
  git rev-parse HEAD > "$BUNDLE_FILE"
  echo "创建了完全包：$FULL_BUNDLE"
else
  # 如果 .bundle 文件存在，读取其中的 commit hash
  LAST_HASH=$(cat "$BUNDLE_FILE")

  if [ -z "$LAST_HASH" ]; then
    # 如果 .bundle 文件为空，则生成完全包
    echo "$BUNDLE_FILE 文件为空，生成完全包。"
    git bundle create "$FULL_BUNDLE" --all
    # 记录当前最新的 commit hash
    git rev-parse HEAD > "$BUNDLE_FILE"
    echo "创建了完全包：$FULL_BUNDLE"
  else
    # 如果 .bundle 文件不为空，生成增量包
    echo "$BUNDLE_FILE 文件存在且不为空，生成增量包。"
    TIMESTAMP=$(date +"%Y%m%d%H%M%S")
    NEW_INCREMENTAL_BUNDLE="$BACKUP_DIR/incremental.$TIMESTAMP.bundle"
    git bundle create "$NEW_INCREMENTAL_BUNDLE" HEAD ^"$LAST_HASH"
    # 更新 .bundle 文件中的 commit hash
    git rev-parse HEAD > "$BUNDLE_FILE"
    echo "创建了增量包：$NEW_INCREMENTAL_BUNDLE"
  fi
fi
