#!/bin/bash

# 检查参数
if [ "$#" -ne 3 ]; then
  echo "用法: $0 <TARGET_FOLDER> <BUNDLE_PATH> <BRANCH>"
  exit 1
fi

# 参数
TARGET_FOLDER="$1"
BUNDLE_PATH="$2"
BRANCH="$3"
FULL_BUNDLE="$BUNDLE_PATH/full.bundle"
INCREMENTAL_BUNDLE="$BUNDLE_PATH/incremental."
MERGED_FILE="$TARGET_FOLDER/.last_merged"

# 检查目标文件夹是否已经是一个 Git 仓库
if [ -d "$TARGET_FOLDER/.git" ]; then
  echo "目标文件夹已经是一个 Git 仓库，应用增量更新。"

  # 进入目标文件夹
  cd "$TARGET_FOLDER" || exit

  # 获取增量包列表并按时间排序
  mapfile -t INCREMENTAL_BUNDLES < <(find "$INCREMENTAL_BUNDLE"*.bundle -type f | sort)

  # 检查是否有增量包
  if [ ${#INCREMENTAL_BUNDLES[@]} -eq 0 ]; then
    echo "没有找到增量包，请先创建增量包。"
    exit 1
  fi

  # 读取上次合并的增量包
  if [ -f "$MERGED_FILE" ]; then
    LAST_MERGED=$(cat "$MERGED_FILE")
  else
    LAST_MERGED=""
  fi

  # 找到下一个要合并的增量包
  NEXT_BUNDLE=""
  for BUNDLE in "${INCREMENTAL_BUNDLES[@]}"; do
    if [ "$BUNDLE" \> "$LAST_MERGED" ]; then
      NEXT_BUNDLE="$BUNDLE"
      break
    fi
  done

  if [ -z "$NEXT_BUNDLE" ]; then
    echo "没有找到新的增量包可供合并。"
    exit 1
  fi

  # 应用增量更新
  echo "合并增量包：$NEXT_BUNDLE"
  INCREMENTAL_REF=$(git bundle list-heads "$NEXT_BUNDLE" | awk '{print $1}')
  git fetch "$NEXT_BUNDLE" "$INCREMENTAL_REF"
  git merge FETCH_HEAD

  # 更新上次合并的增量包记录
  echo "$NEXT_BUNDLE" > "$MERGED_FILE"
  echo "已更新合并记录为：$NEXT_BUNDLE"

else
  echo "目标文件夹不是一个 Git 仓库，初始化仓库。"
  # 初始化仓库
  git clone "$FULL_BUNDLE" "$TARGET_FOLDER"
  cd "$TARGET_FOLDER" || exit
  git checkout $BRANCH
fi
