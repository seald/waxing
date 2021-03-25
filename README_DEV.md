- `buffer` is kept at 5.6.1 because the whole point of it being there to begin with is to check if waxing is compatible
  with the buffer polyfill in non-node environments, including old ones, and there was a bug
  (https://github.com/feross/buffer/issues/251) fixed in 5.7.0 that waxing should work around
