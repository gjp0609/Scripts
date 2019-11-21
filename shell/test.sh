#! /bin/bash
if [ -z "$1" ]; then
  java -version
else
  "$1"/bin/java -version
fi
