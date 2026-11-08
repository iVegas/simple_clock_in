// Modal sheet on the native <dialog> (focus trap, Esc and top layer come from the browser).
// Mount it with v-if; it opens on mount and emits "close" on Esc, backdrop tap or the × button.
import { ref, onMounted } from 'vue';
import Icon from './Icon.js';

let seq = 0;

export default {
  name: 'Modal',
  components: { Icon },
  props: { title: { type: String, required: true } },
  emits: ['close'],
  setup(props, { emit }) {
    const el = ref(null);
    const titleId = `modal-title-${++seq}`;
    onMounted(() => el.value.showModal());
    const onCancel = (e) => {
      e.preventDefault(); // Esc: let the parent unmount us
      emit('close');
    };
    const onBackdrop = (e) => { if (e.target === el.value) emit('close'); };
    return { el, titleId, onCancel, onBackdrop };
  },
  template: /* html */`
    <dialog ref="el" class="modal" :aria-labelledby="titleId" @cancel="onCancel" @click="onBackdrop">
      <div class="modal-body">
        <div class="modal-head">
          <h2 :id="titleId">{{ title }}</h2>
          <button type="button" class="btn ghost icon-only" :aria-label="$t('common.close')" @click="$emit('close')"><Icon name="close"/></button>
        </div>
        <slot/>
      </div>
    </dialog>`,
};
