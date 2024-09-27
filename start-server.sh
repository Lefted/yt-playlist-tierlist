#!/bin/bash
source ~/.nvm/nvm.sh
serve . &
until curl --output /dev/null --silent --head --fail http://localhost:3000; do
    printf '.'
    sleep 1
done
start http://localhost:3000

